import type { IImage } from "./interface.ts";
import { findBox, readUInt32BE, toUTF8String } from "./utils.ts";

export const JP2: IImage = {
  validate(input) {
    // JPEG 2000 signature box, followed by a file type box
    if (toUTF8String(input, 4, 8) !== "jP  ") {
      return false;
    }
    return findBox(input, "ftyp") !== undefined;
  },

  calculate(input) {
    // The image header box (ihdr) is the first box inside the JP2 header box (jp2h)
    const jp2hBox = findBox(input, "jp2h");
    const ihdrBox =
      jp2hBox &&
      findBox(input, "ihdr", jp2hBox.offset + 8, jp2hBox.offset + jp2hBox.size);
    if (!ihdrBox || ihdrBox.size < 16) {
      throw new TypeError("Invalid JPEG 2000, no ihdr box found");
    }
    return {
      height: readUInt32BE(input, ihdrBox.offset + 8),
      width: readUInt32BE(input, ihdrBox.offset + 12),
    };
  },
};
