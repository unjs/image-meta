import type { IImage } from "./interface.ts";
import { toUTF8String, readUInt, readUInt32LE } from "./utils.ts";

// KTX 1.1 writes 0x04030201 in the writer's byte order, which the rest of the header follows
const LITTLE_ENDIAN = 0x04_03_02_01;
const BIG_ENDIAN = 0x01_02_03_04;

export const KTX: IImage = {
  validate: (input) => {
    const signature = toUTF8String(input, 1, 7);
    return signature === "KTX 11" || signature === "KTX 20";
  },

  calculate: (input) => {
    // KTX 2.0 is always little endian, with pixelWidth at 20 (followed by pixelHeight)
    if (input[5] === 0x32) {
      return {
        height: readUInt32LE(input, 24),
        width: readUInt32LE(input, 20),
      };
    }

    // KTX 1.1 has pixelWidth at 36 (followed by pixelHeight)
    const endianness = readUInt32LE(input, 12);
    if (endianness !== LITTLE_ENDIAN && endianness !== BIG_ENDIAN) {
      throw new TypeError("Invalid KTX, unknown endianness");
    }
    const isBigEndian = endianness === BIG_ENDIAN;
    return {
      height: readUInt(input, 32, 40, isBigEndian),
      width: readUInt(input, 32, 36, isBigEndian),
    };
  },
};
