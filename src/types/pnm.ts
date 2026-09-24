import type { IImage, ISize } from "./interface.ts";
import { toUTF8String } from "./utils.ts";

const PNMTypes = {
  P1: "pbm/ascii",
  P2: "pgm/ascii",
  P3: "ppm/ascii",
  P4: "pbm",
  P5: "pgm",
  P6: "ppm",
  P7: "pam",
  PF: "pfm",
  Pf: "pfm",
} as const;

type ValidSignature = keyof typeof PNMTypes;
type Handler = (input: Uint8Array) => ISize;

const isLineBreak = (byte: number) => byte === 0x0a || byte === 0x0d;
// Space, tab, line feed, vertical tab, form feed and carriage return
const isWhitespace = (byte: number) =>
  byte === 0x20 || (byte >= 0x09 && byte <= 0x0d);

// Header values are unsigned decimal integers, anything else is NaN (rejected by `imageMeta`)
const toInteger = (value = "") =>
  /^\d+$/.test(value) ? Number(value) : Number.NaN;

// A PAM header line with a tag we need, and its value (the next token)
const PAMLine = /^\s*(width|height|endhdr)(?!\S)\s*(\S*)/i;

const handlers: { [type: string]: Handler } = {
  // Width and height are the first two tokens after the magic number
  default: (input) => {
    const [width, height] = readHeader(input, "tokens");
    return {
      height: toInteger(height),
      width: toInteger(width),
    };
  },
  // Header lines are `TAG value` pairs, up to `ENDHDR`
  pam: (input) => {
    const size: { [key: string]: number } = {};
    for (const line of readHeader(input, "lines")) {
      const [, tag = "", value] = PAMLine.exec(line) || [];
      const key = tag.toLowerCase();
      if (key === "width" || key === "height") {
        size[key] = toInteger(value);
      }
      if (key === "endhdr" || ("width" in size && "height" in size)) {
        break;
      }
    }
    // Missing values are undefined (rejected by `imageMeta`)
    return {
      height: size.height,
      width: size.width,
    };
  },
};

// Lazily yields the header tokens or lines after the magic number, where `#` comments run to the
// end of the line and also separate them. It decodes about 1 KB at a time (one decode per short
// line is slow), and the caller stops iterating once it has the values it needs
function* readHeader(
  input: Uint8Array,
  unit: "tokens" | "lines",
): Generator<string> {
  const isSeparator = unit === "lines" ? isLineBreak : isWhitespace;
  const values = unit === "lines" ? /[^\n\r]+/g : /[^\t-\r ]+/g;
  let start = 2;
  while (start < input.length) {
    // Cut after the last separator outside of a comment, so no token, line or comment is split.
    // Only a window without one is extended, so at most ~1 KB of pixel data is decoded
    let end = start;
    let cut = start;
    let inComment = false;
    while (end < input.length && (end - start < 1024 || cut === start)) {
      const byte = input[end++];
      inComment = byte === 0x23 /* # */ || (inComment && !isLineBreak(byte));
      if (!inComment && isSeparator(byte)) {
        cut = end;
      }
    }
    if (end === input.length) {
      cut = end;
    }
    const text = toUTF8String(input, start, cut).replace(/#[^\n\r]*/g, "\n");
    yield* text.match(values) || [];
    start = cut;
  }
}

export const PNM: IImage = {
  validate: (input) => toUTF8String(input, 0, 2) in PNMTypes,

  calculate(input) {
    const signature = toUTF8String(input, 0, 2) as ValidSignature;
    const type = PNMTypes[signature];
    const handler = handlers[type] || handlers.default;
    return handler(input);
  },
};
