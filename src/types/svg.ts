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

// The root tag, as `svgReg` matches it at the first `<svg` followed by whitespace once comments
// are removed. The bytes are scanned in one pass, as the regex overflows the stack on a multi-MB
// tag, and only the root tag is decoded. All markers are ASCII, which UTF-8 never uses within a
// multi-byte character
function extractRoot(input: Uint8Array): string | undefined {
  const length = input.length;
  let start = 0;
  let offset = 0;
  let matched = 0; // bytes of `<svg` matched so far

  // The tag starts at the first `<svg` followed by whitespace
  while (offset < length) {
    const byte = input[offset];
    if (byte === TAG_START && isCommentAt(input, offset)) {
      offset = skipComment(input, offset);
      continue;
    }
    if (matched === SVG_TAG.length && isSpaceAt(input, offset)) {
      break;
    }
    if (byte === TAG_START) {
      start = offset;
      matched = 1;
    } else if (matched < SVG_TAG.length && byte === SVG_TAG[matched]) {
      matched++;
    } else {
      matched = 0;
    }
    offset++;
  }

  // The tag ends at the first `>` outside of a quoted attribute value
  let quote = 0;
  for (offset++; offset < length; offset++) {
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
      break;
    }
  }
  if (offset >= length) {
    return undefined;
  }
  // Decoding only fails for a tag too long for a string
  try {
    return toUTF8String(input, start, offset + 1).replace(commentReg, "");
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
  // Scan only the first kilo-byte to speed up the check on larger files
  validate: (input) => svgReg.test(toUTF8String(input, 0, 1000)),

  calculate(input) {
    // Only the first `<svg` tag (the root) is tried: retrying from every later one
    // would rescan the rest of the input each time (quadratic on bad input)
    const root = extractRoot(input);
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
