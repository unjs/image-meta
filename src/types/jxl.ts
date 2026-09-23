// based on the JPEG XL spec (ISO/IEC 18181) SizeHeader
import type { IImage, ISize } from "./interface";
import { findBox, readUInt32BE, toHexString, toUTF8String } from "./utils";

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

// The size header is at most 11 bytes into the codestream
const CODESTREAM_PREFIX_BYTES = 32;

// Extract the start of the codestream from a JXL container (jxlc box, or jxlp partial boxes)
function extractCodestream(input: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let length = 0;
  let offset = 0;
  while (offset + 8 <= input.length && length < CODESTREAM_PREFIX_BYTES) {
    let size = readUInt32BE(input, offset);
    const name = toUTF8String(input, offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      // 64-bit box size follows the name
      if (offset + 16 > input.length) {
        break;
      }
      size =
        readUInt32BE(input, offset + 8) * 2 ** 32 +
        readUInt32BE(input, offset + 12);
      headerSize = 16;
    } else if (size === 0) {
      // The last box may extend to the end of the file
      size = input.length - offset;
    }

    if (name === "jxlc" || name === "jxlp") {
      // Partial codestream boxes start with a 4-byte index
      const start = offset + headerSize + (name === "jxlp" ? 4 : 0);
      if (size < start - offset) {
        throw new TypeError(`Invalid JXL, corrupt ${name} box`);
      }
      // Clamp to the input, so a truncated file still yields its size header
      const end = Math.min(
        offset + size,
        input.length,
        start + CODESTREAM_PREFIX_BYTES - length,
      );
      if (end > start) {
        parts.push(input.subarray(start, end));
        length += end - start;
      }
      if (name === "jxlc") {
        break;
      }
    }

    if (size < headerSize) {
      throw new TypeError("Invalid JXL, corrupt box");
    }
    offset += size;
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
