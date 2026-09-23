import type { IImage } from "./interface";
import { HEIC } from "./heic";
import { toUTF8String } from "./utils";

export const AVIF: IImage = {
  validate: (input) => toUTF8String(input, 8, 12) === "avif",

  calculate: (input) => HEIC.calculate(input),
};
