import type { IImage } from "./interface.ts";
import { HEIC } from "./heic.ts";
import { toUTF8String } from "./utils.ts";

export const AVIF: IImage = {
  validate: (input) => toUTF8String(input, 8, 12) === "avif",

  calculate: (input) => HEIC.calculate(input),
};
