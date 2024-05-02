import type { IImage } from "./interface";
import { toUTF8String, readUInt32BE } from "./utils";

export const AVIF: IImage = {
  validate: (input) => toUTF8String(input, 8, 12) === "avif",

  calculate: (input) => ({
    height: readUInt32BE(input, 200),
    width: readUInt32BE(input, 196),
  }),
};
