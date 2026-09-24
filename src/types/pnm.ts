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
} as const;

type ValidSignature = keyof typeof PNMTypes;
type Handler = (lines: Iterable<string>) => ISize;

const handlers: { [type: string]: Handler } = {
  default: (lines) => {
    let dimensions: string[] = [];

    for (const line of lines) {
      if (line[0] === "#") {
        continue;
      }
      dimensions = line.split(" ");
      break;
    }

    if (dimensions.length === 2) {
      return {
        height: Number.parseInt(dimensions[1], 10),
        width: Number.parseInt(dimensions[0], 10),
      };
    } else {
      throw new TypeError("Invalid PNM");
    }
  },
  pam: (lines) => {
    const size: { [key: string]: number } = {};
    for (const line of lines) {
      if (line.length > 16 || (line.codePointAt(0) || 0) > 128) {
        continue;
      }
      const [key, value] = line.split(" ");
      if (key && value) {
        size[key.toLowerCase()] = Number.parseInt(value, 10);
      }
      if (size.height && size.width) {
        break;
      }
    }

    if (size.height && size.width) {
      return {
        height: size.height,
        width: size.width,
      };
    } else {
      throw new TypeError("Invalid PAM");
    }
  },
};

// Yields the same lines as `toUTF8String(input, start).split(/[\n\r]+/)`, but lazily
// decodes chunks cut at line breaks, so the pixel data after the header is never decoded
function* readLines(input: Uint8Array, start: number): Generator<string> {
  const isLineBreak = (i: number) => input[i] === 0x0a || input[i] === 0x0d;
  while (true) {
    let end = Math.min(start + 1024, input.length);
    while (end < input.length && !isLineBreak(end)) {
      end++;
    }
    while (end > start && isLineBreak(end - 1)) {
      end--;
    }
    yield* toUTF8String(input, start, end).split(/[\n\r]+/);
    if (end === input.length) {
      return;
    }
    start = end;
    while (isLineBreak(start)) {
      start++;
    }
  }
}

export const PNM: IImage = {
  validate: (input) => toUTF8String(input, 0, 2) in PNMTypes,

  calculate(input) {
    const signature = toUTF8String(input, 0, 2) as ValidSignature;
    const type = PNMTypes[signature];
    const handler = handlers[type] || handlers.default;
    return handler(readLines(input, 3));
  },
};
