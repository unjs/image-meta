import type { IImage } from "./interface.ts";
import { toUTF8String, readUInt32LE } from "./utils.ts";

export const KTX: IImage = {
  validate: (input) => {
    const signature = toUTF8String(input, 1, 7);
    return signature === "KTX 11" || signature === "KTX 20";
  },

  calculate: (input) => {
    // KTX 2.0 has pixelWidth at 20, KTX 1.1 has it at 36 (followed by pixelHeight)
    const offset = input[5] === 0x32 ? 20 : 36;
    return {
      height: readUInt32LE(input, offset + 4),
      width: readUInt32LE(input, offset),
    };
  },
};
