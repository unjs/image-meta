// based on http://www.compix.com/fileformattif.htm
import type { IImage } from "./interface";
import { toHexString } from "./utils";

const signatures = new Set([
  "492049", // ?
  "49492a00", // Little endian
  "4d4d002a", // Big Endian
  "4d4d002a", // BigTIFF > 4GB. currently not supported
]);

export const TIFF: IImage = {
  validate: (input) => signatures.has(toHexString(input, 0, 4)),
  calculate: () => ({ width: undefined, height: undefined }),
};
