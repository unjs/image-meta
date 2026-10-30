import type { IImage, ISize } from "./interface.ts";
import { toUTF8String } from "./utils.ts";

type IAttributes = {
  width: number | null;
  height: number | null;
  viewbox?: IAttributes | null;
};

const svgReg = /<svg\s([^"'>]|"[^"]*"|'[^']*')*>/;
const commentReg = /<!--[\s\S]*?(?:-->|$)/g;

const extractorRegExps = {
  height: /\sheight=(["'])([^%]+?)\1/,
  viewbox: /\sviewbox=(["'])([\s\S]+?)\1/i,
  width: /\swidth=(["'])([^%]+?)\1/,
};

const TAG_START = 0x3c; // <
const TAG_END = 0x3e; // >
const SVG_TAG = [TAG_START, 0x73, 0x76, 0x67]; // <svg
const DOUBLE_QUOTE = 0x22;
const SINGLE_QUOTE = 0x27;

// Non-ASCII characters matched by `\s` (U+00A0, U+1680, U+2000-U+200A, U+2028, U+2029, U+202F,
// U+205F, U+3000 and U+FEFF), as their UTF-8 bytes read one char per byte
const unicodeSpaceReg =
  /^(?:\u00C2\u00A0|\u00E1\u009A\u0080|\u00E2\u0080[\u0080-\u008A\u00A8\u00A9\u00AF]|\u00E2\u0081\u009F|\u00E3\u0080\u0080|\u00EF\u00BB\u00BF)/;

// Whether the character at `offset` matches `\s`
function isSpaceAt(input: Uint8Array, offset: number) {
  const byte = input[offset];
  if (byte < 0x80) {
    return byte === 0x20 || (byte >= 0x09 && byte <= 0x0d);
  }
  const bytes = String.fromCharCode(byte, input[offset + 1], input[offset + 2]);
  return unicodeSpaceReg.test(bytes);
}

// Bounds are checked, as reading past the end slows down the loops calling it
const isCommentAt = (input: Uint8Array, offset: number) =>
  input[offset] === TAG_START &&
  offset + 3 < input.length &&
  input[offset + 1] === 0x21 && // !
  input[offset + 2] === 0x2d && // -
  input[offset + 3] === 0x2d;

// Offset after the comment at `offset`, like `commentReg`: it ends at the first `-->` after
// its `<!--`, or runs to the end of the input
function skipComment(input: Uint8Array, offset: number) {
  for (let end = offset + 4; end + 2 < input.length; end++) {
    if (
      input[end] === 0x2d &&
      input[end + 1] === 0x2d &&
      input[end + 2] === TAG_END
    ) {
      return end + 3;
    }
  }
  return input.length;
}

// Offset of the first `<svg` followed by whitespace once comments are removed, as `svgReg`
// matches it, or -1. All markers are ASCII, which UTF-8 never uses within a multi-byte character
function findSvgTag(input: Uint8Array) {
  const length = input.length;
  let start = 0;
  let matched = 0; // bytes of `<svg` matched so far
  for (let offset = 0; offset < length; offset++) {
    const byte = input[offset];
    if (byte === TAG_START && isCommentAt(input, offset)) {
      offset = skipComment(input, offset) - 1;
      continue;
    }
    if (matched === SVG_TAG.length && isSpaceAt(input, offset)) {
      return start;
    }
    if (byte === TAG_START) {
      start = offset;
      matched = 1;
    } else if (matched < SVG_TAG.length && byte === SVG_TAG[matched]) {
      matched++;
    } else {
      matched = 0;
    }
  }
  return -1;
}

const isXMLSpace = (byte: number) =>
  byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;

// Offset after the first `?>` from `offset`, or the end of the input
function skipProcessingInstruction(input: Uint8Array, offset: number) {
  for (let end = offset; end + 1 < input.length; end++) {
    if (input[end] === 0x3f && input[end + 1] === TAG_END) {
      return end + 2;
    }
  }
  return input.length;
}

const DOCTYPE = [0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]; // DOCTYPE

// Whether `<!DOCTYPE` (case-insensitive) is at `offset`
function isDoctypeAt(input: Uint8Array, offset: number) {
  if (input[offset + 1] !== 0x21) {
    return false;
  }
  for (const [index, byte] of DOCTYPE.entries()) {
    // Clearing the lower-case bit only maps lower-case ASCII letters onto these upper-case ones
    if ((input[offset + 2 + index] & 0xdf) !== byte) {
      return false;
    }
  }
  return true;
}

// Offset after the `<!DOCTYPE` declaration whose body starts at `offset`, or the end of the
// input. It ends at the first `>` outside of quotes, comments, processing instructions and its
// internal subset (`[ … ]`), whose declarations may hold any of these
function skipDoctype(input: Uint8Array, offset: number) {
  const length = input.length;
  let subset = false;
  while (offset < length) {
    const byte = input[offset];
    if (byte === DOUBLE_QUOTE || byte === SINGLE_QUOTE) {
      const end = input.indexOf(byte, offset + 1);
      if (end === -1) {
        return length;
      }
      offset = end + 1;
      continue;
    }
    if (byte === TAG_START) {
      if (isCommentAt(input, offset)) {
        offset = skipComment(input, offset);
        continue;
      }
      if (input[offset + 1] === 0x3f) {
        offset = skipProcessingInstruction(input, offset + 2);
        continue;
      }
    }
    if (byte === 0x5b) {
      subset = true; // [
    } else if (byte === 0x5d) {
      subset = false; // ]
    } else if (byte === TAG_END && !subset) {
      return offset + 1;
    }
    offset++;
  }
  return length;
}

// Offset of the root `<svg` when it is the first element after the XML prolog (byte order mark,
// whitespace, processing instructions such as `<?xml … ?>`, comments and a doctype), or -1.
// Anything else ends the scan, so other input is rejected after a few bytes
function findPrologRoot(input: Uint8Array) {
  const length = input.length;
  let offset =
    input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf ? 3 : 0;
  while (offset < length) {
    const byte = input[offset];
    if (isXMLSpace(byte)) {
      offset++;
      continue;
    }
    if (byte !== TAG_START) {
      return -1;
    }
    if (input[offset + 1] === 0x3f) {
      offset = skipProcessingInstruction(input, offset + 2);
    } else if (isCommentAt(input, offset)) {
      offset = skipComment(input, offset);
    } else if (isDoctypeAt(input, offset)) {
      offset = skipDoctype(input, offset + 2 + DOCTYPE.length);
    } else {
      const isRoot =
        input[offset + 1] === SVG_TAG[1] &&
        input[offset + 2] === SVG_TAG[2] &&
        input[offset + 3] === SVG_TAG[3] &&
        isSpaceAt(input, offset + 4);
      return isRoot ? offset : -1;
    }
  }
  return -1;
}

// Offset of the `>` ending the tag at `start`, as `svgReg` matches it: the first `>` outside of
// a quoted attribute value or a comment, or -1
function findTagEnd(input: Uint8Array, start: number) {
  let quote = 0;
  for (let offset = start + SVG_TAG.length; offset < input.length; offset++) {
    const byte = input[offset];
    if (byte === TAG_START && isCommentAt(input, offset)) {
      offset = skipComment(input, offset) - 1;
      continue;
    }
    if (quote) {
      if (byte === quote) {
        quote = 0;
      }
    } else if (byte === DOUBLE_QUOTE || byte === SINGLE_QUOTE) {
      quote = byte;
    } else if (byte === TAG_END) {
      return offset;
    }
  }
  return -1;
}

// The root tag starting at `start`, without comments. The bytes are scanned in one pass, as
// `svgReg` overflows the stack on a multi-MB tag, and only the root tag is decoded
function extractRoot(input: Uint8Array, start: number): string | undefined {
  if (start === -1) {
    return undefined;
  }
  const end = findTagEnd(input, start);
  if (end === -1) {
    return undefined;
  }
  // Decoding only fails for a tag too long for a string
  try {
    return toUTF8String(input, start, end + 1).replace(commentReg, "");
  } catch {
    return undefined;
  }
}

const INCH_CM = 2.54;
const units: { [unit: string]: number } = {
  in: 96,
  cm: 96 / INCH_CM,
  em: 16,
  ex: 8,
  m: (96 / INCH_CM) * 100,
  mm: 96 / INCH_CM / 10,
  pc: 96 / 6,
  pt: 96 / 72,
  px: 1,
};

const unitsReg = new RegExp(
  `^([0-9.]+(?:e\\d+)?)(${Object.keys(units).join("|")})?$`,
);

function parseLength(len: string) {
  const m = unitsReg.exec(len);
  if (!m) {
    return undefined;
  }
  return Number(m[1]) * (units[m[2]] || 1);
}

function parseViewbox(viewbox: string): IAttributes {
  // min-x, min-y, width and height, separated by whitespace and/or a comma.
  // Kept unrounded, as they set the aspect ratio
  // Only these four are split off, not every value of a huge attribute
  const bounds = viewbox.trim().split(/[\s,]+/, 4);
  return {
    height: parseLength(bounds[3]) as number,
    width: parseLength(bounds[2]) as number,
  };
}

function parseAttributes(root: string): IAttributes {
  const width = root.match(extractorRegExps.width);
  const height = root.match(extractorRegExps.height);
  const viewbox = root.match(extractorRegExps.viewbox);
  return {
    height: height && Math.round(parseLength(height[2]) as number),
    viewbox: viewbox && (parseViewbox(viewbox[2]) as IAttributes),
    width: width && Math.round(parseLength(width[2]) as number),
  };
}

function calculateByDimensions(attrs: IAttributes): ISize {
  return {
    height: attrs.height as number,
    width: attrs.width as number,
  };
}

// Nearest whole pixel, but a non-zero (sub-pixel) length never becomes 0
function toPixels(length: number) {
  return Math.max(1, Math.round(length));
}

function calculateByViewbox(attrs: IAttributes, viewbox: IAttributes): ISize {
  const vbWidth = viewbox.width as number;
  const vbHeight = viewbox.height as number;
  // Scale by both sides rather than a pre-divided ratio, which is inexact
  // (e.g. 21 / (3 / 17) = 118.99999999999999)
  if (attrs.width) {
    return {
      height: toPixels((attrs.width * vbHeight) / vbWidth),
      width: attrs.width,
    };
  }
  if (attrs.height) {
    return {
      height: attrs.height,
      width: toPixels((attrs.height * vbWidth) / vbHeight),
    };
  }
  return {
    height: toPixels(vbHeight),
    width: toPixels(vbWidth),
  };
}

export const SVG: IImage = {
  validate(input) {
    // Any `<svg` tag in the first kilo-byte, as before. Otherwise, as the prolog (e.g. comments
    // or a doctype) or the root tag itself may be longer, a root that is the first element.
    // Only the prolog and the root tag are scanned, not the whole input with a regex
    if (svgReg.test(toUTF8String(input, 0, 1000))) {
      return true;
    }
    const start = findPrologRoot(input);
    return start !== -1 && findTagEnd(input, start) !== -1;
  },

  calculate(input) {
    // The root is the first element after the prolog, which is skipped as a whole, so an
    // `<svg` in a doctype or processing instruction is not mistaken for it. Otherwise, it is
    // the first `<svg` tag outside comments. Only this one tag is tried: retrying from every
    // later one would rescan the rest of the input each time (quadratic on bad input)
    const prologRoot = findPrologRoot(input);
    const root = extractRoot(
      input,
      prologRoot === -1 ? findSvgTag(input) : prologRoot,
    );
    if (root) {
      const attrs = parseAttributes(root);
      if (attrs.width && attrs.height) {
        return calculateByDimensions(attrs);
      }
      if (attrs.viewbox?.width && attrs.viewbox.height) {
        return calculateByViewbox(attrs, attrs.viewbox);
      }
    }
    throw new TypeError("Invalid SVG");
  },
};
