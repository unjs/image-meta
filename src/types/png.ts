import type { IImage, ISize } from "./interface.ts";
import { toUTF8String, readUInt32BE, toTagCode } from "./utils.ts";

const pngSignature = "PNG\r\n\u001A\n";
const pngImageHeaderChunkName = "IHDR";

// Used to detect "fried" png's: http://www.jongware.com/pngdefry.html
const pngFriedChunkName = "CgBI";

const ACTL = toTagCode("acTL");
const IDAT = toTagCode("IDAT");

// An APNG has an animation control chunk (acTL) with the frame count before the first IDAT
function readAnimation(input: Uint8Array): Pick<ISize, "animated" | "pages"> {
  let offset = 8;
  while (offset + 12 <= input.length) {
    const type = readUInt32BE(input, offset + 4);
    if (type === ACTL) {
      // PNG limits 4-byte integers to 2^31 - 1
      const frames = readUInt32BE(input, offset + 8);
      return frames > 0 && frames < 2 ** 31
        ? { animated: frames > 1, pages: frames }
        : {};
    }
    if (type === IDAT) {
      return { animated: false, pages: 1 };
    }
    // Length, type, data, then CRC
    offset += 12 + readUInt32BE(input, offset);
  }
  return {};
}

export const PNG: IImage = {
  validate(input) {
    if (pngSignature === toUTF8String(input, 1, 8)) {
      let chunkName = toUTF8String(input, 12, 16);
      if (chunkName === pngFriedChunkName) {
        chunkName = toUTF8String(input, 28, 32);
      }
      if (chunkName !== pngImageHeaderChunkName) {
        throw new TypeError("Invalid PNG");
      }
      return true;
    }
    return false;
  },

  calculate(input) {
    if (toUTF8String(input, 12, 16) === pngFriedChunkName) {
      return {
        height: readUInt32BE(input, 36),
        width: readUInt32BE(input, 32),
        ...readAnimation(input),
      };
    }
    return {
      height: readUInt32BE(input, 20),
      width: readUInt32BE(input, 16),
      ...readAnimation(input),
    };
  },
};
