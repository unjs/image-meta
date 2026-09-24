import type { IImage } from "./interface.ts";
import {
  toUTF8String,
  readInt32LE,
  readUInt16LE,
  readUInt32LE,
} from "./utils.ts";

// BITMAPCOREHEADER (OS/2 1.x) stores the size as unsigned 16-bit fields
const CORE_HEADER_SIZE = 12;

export const BMP: IImage = {
  validate: (input) => toUTF8String(input, 0, 2) === "BM",

  calculate: (input) => {
    if (readUInt32LE(input, 14) === CORE_HEADER_SIZE) {
      return {
        height: readUInt16LE(input, 20),
        width: readUInt16LE(input, 18),
      };
    }
    // Both are signed: a negative height means top-down rows, a negative width is invalid
    return {
      height: Math.abs(readInt32LE(input, 22)),
      width: readInt32LE(input, 18),
    };
  },
};
