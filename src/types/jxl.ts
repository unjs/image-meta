// based on the JPEG XL spec (ISO/IEC 18181) SizeHeader
import type { IImage, ISize } from "./interface";
import { findBox, toHexString, toUTF8String } from "./utils";

// Read `length` bits (least significant first), after the 2-byte codestream signature
function createBitReader(input: Uint8Array) {
  let bitOffset = 16;
  return (length: number) => {
    let result = 0;
    for (let i = 0; i < length; i++, bitOffset++) {
      const byte = input[bitOffset >> 3];
      if (byte === undefined) {
        throw new TypeError("Invalid JXL, truncated codestream");
      }
      result += ((byte >> (bitOffset & 7)) & 1) * 2 ** i;
    }
    return result;
  };
}

// Width to height ratios, indexed by the 3-bit ratio field (0 means explicit width)
const RATIOS = [
  [1, 1],
  [12, 10],
  [4, 3],
  [3, 2],
  [16, 9],
  [5, 4],
  [2, 1],
];

function calculateCodestream(input: Uint8Array): ISize {
  const readBits = createBitReader(input);
  const readSize = (isSmall: boolean) =>
    isSmall
      ? 8 * (1 + readBits(5))
      : 1 + readBits([9, 13, 18, 30][readBits(2)]);

  const isSmall = readBits(1) === 1;
  const height = readSize(isSmall);
  const ratio = readBits(3);
  if (ratio === 0) {
    return { height, width: readSize(isSmall) };
  }
  const [numerator, denominator] = RATIOS[ratio - 1];
  return { height, width: Math.floor((height * numerator) / denominator) };
}

// Extract (the start of) the codestream from a JXL container
function extractCodestream(input: Uint8Array): Uint8Array {
  const jxlcBox = findBox(input, "jxlc");
  if (jxlcBox) {
    return input.subarray(jxlcBox.offset + 8, jxlcBox.offset + jxlcBox.size);
  }

  // Partial codestream boxes start with a 4-byte index; the size header only needs the first few bytes
  const parts: Uint8Array[] = [];
  let length = 0;
  let offset = 0;
  while (length < 32) {
    const jxlpBox = findBox(input, "jxlp", offset);
    if (!jxlpBox) {
      break;
    }
    if (jxlpBox.size < 12) {
      throw new TypeError("Invalid JXL, corrupt jxlp box");
    }
    const part = input.subarray(
      jxlpBox.offset + 12,
      jxlpBox.offset + jxlpBox.size,
    );
    parts.push(part);
    length += part.length;
    offset = jxlpBox.offset + jxlpBox.size;
  }

  const codestream = new Uint8Array(length);
  let position = 0;
  for (const part of parts) {
    codestream.set(part, position);
    position += part.length;
  }
  return codestream;
}

const isCodestream = (input: Uint8Array) => toHexString(input, 0, 2) === "ff0a";

export const JXL: IImage = {
  validate: (input) => {
    if (isCodestream(input)) {
      return true;
    }
    // Container: JXL signature box, then a file type box with the "jxl " brand
    if (toUTF8String(input, 4, 8) !== "JXL ") {
      return false;
    }
    const ftypBox = findBox(input, "ftyp");
    return (
      ftypBox !== undefined &&
      toUTF8String(input, ftypBox.offset + 8, ftypBox.offset + 12) === "jxl "
    );
  },

  calculate: (input) => {
    const codestream = isCodestream(input) ? input : extractCodestream(input);
    if (!isCodestream(codestream)) {
      throw new TypeError("Invalid JXL, no codestream found");
    }
    return calculateCodestream(codestream);
  },
};
