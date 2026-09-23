import type { IImage } from "./interface";
import { readUInt32BE } from "./utils";

export const J2C: IImage = {
  // Start of codestream (SOC) marker, immediately followed by the image and tile size (SIZ) marker
  validate: (input) => readUInt32BE(input, 0) === 0xff_4f_ff_51,

  // The image area is the reference grid size (Xsiz, Ysiz) minus the image offset (XOsiz, YOsiz)
  calculate: (input) => ({
    height: readUInt32BE(input, 12) - readUInt32BE(input, 20),
    width: readUInt32BE(input, 8) - readUInt32BE(input, 16),
  }),
};
