import type { IImage, ISize } from "./interface.ts";
import { toUTF8String, readUInt16LE } from "./utils.ts";

const TRAILER = 0x3b;
const IMAGE_DESCRIPTOR = 0x2c;
const EXTENSION = 0x21;

// Size in bytes of a color table, when the packed field flags one
const colorTableSize = (flags: number) =>
  flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0;

// Count frames (image descriptors) up to the trailer. Data sub-blocks are skipped by their
// length byte without decoding, so the walk is linear in the input size
function readFrames(input: Uint8Array): Pick<ISize, "animated" | "pages"> {
  let frames = 0;
  let offset = 13 + colorTableSize(input[10]);
  while (offset < input.length) {
    const block = input[offset];
    if (block === TRAILER) {
      return frames > 0 ? { animated: frames > 1, pages: frames } : {};
    }
    if (block === IMAGE_DESCRIPTOR) {
      frames++;
      // Descriptor (10), local color table, then the LZW minimum code size (1)
      offset += 10 + colorTableSize(input[offset + 9]) + 1;
    } else if (block === EXTENSION) {
      // Introducer and label
      offset += 2;
    } else {
      break;
    }
    // Data sub-blocks, up to the zero-length terminator
    while (offset < input.length && input[offset] !== 0) {
      offset += input[offset] + 1;
    }
    offset++;
  }
  // Truncated or corrupt: the frame count is unknown, but more than one frame was seen
  return frames > 1 ? { animated: true } : {};
}

const gifRegexp = /^GIF8[79]a/;
export const GIF: IImage = {
  validate: (input) => gifRegexp.test(toUTF8String(input, 0, 6)),

  calculate: (input) => ({
    height: readUInt16LE(input, 8),
    width: readUInt16LE(input, 6),
    ...readFrames(input),
  }),
};
