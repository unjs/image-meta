import type { IImage } from "./interface.ts";
import { detectHeifType, HEIC } from "./heic.ts";

export const AVIF: IImage = {
  validate: (input) => detectHeifType(input) === "avif",

  calculate: (input) => HEIC.calculate(input),
};
