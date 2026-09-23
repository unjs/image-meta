import type { IImage, ISize } from "./interface";
import { toUTF8String, readUInt32BE } from "./utils";

/**
 * ICNS Header
 *
 * | Offset | Size | Purpose                                                |
 * | 0     | 4    | Magic literal, must be "icns" (0x69, 0x63, 0x6e, 0x73) |
 * | 4      | 4    | Length of file, in bytes, msb first.                   |
 *
 */
const SIZE_HEADER = 4 + 4; // 8
const FILE_LENGTH_OFFSET = 4; // MSB => BIG ENDIAN

/**
 * Image Entry
 *
 * | Offset | Size | Purpose                                                          |
 * | 0     | 4    | Icon type, see OSType below.                                     |
 * | 4      | 4    | Length of data, in bytes (including type and length), msb first. |
 * | 8      | n    | Icon data                                                        |
 */
const ENTRY_LENGTH_OFFSET = 4; // MSB => BIG ENDIAN

const ICON_TYPE_SIZE: { [key: string]: number } = {
  ICON: 32,
  "ICN#": 32,
  // m => 16 x 16
  "icm#": 16,
  icm4: 16,
  icm8: 16,
  // s => 16 x 16
  "ics#": 16,
  ics4: 16,
  ics8: 16,
  is32: 16,
  s8mk: 16,
  icp4: 16,
  ic04: 16,
  // . => 18 x 18
  icsb: 18,
  // . => 24 x 24
  sb24: 24,
  // l => 32 x 32
  icl4: 32,
  icl8: 32,
  il32: 32,
  l8mk: 32,
  icp5: 32,
  ic05: 32,
  ic11: 32, // 16 x 16 @2x
  // . => 36 x 36
  icsB: 36, // 18 x 18 @2x
  // h => 48 x 48
  ich4: 48,
  ich8: 48,
  ih32: 48,
  h8mk: 48,
  SB24: 48, // 24 x 24 @2x
  // . => 64 x 64
  icp6: 64,
  ic12: 64, // 32 x 32 @2x
  // t => 128 x 128
  it32: 128,
  t8mk: 128,
  ic07: 128,
  // . => 256 x 256
  ic08: 256,
  ic13: 256, // 128 x 128 @2x
  // . => 512 x 512
  ic09: 512,
  ic14: 512, // 256 x 256 @2x
  // . => 1024 x 1024
  ic10: 1024, // 512 x 512 @2x
};

function readImageHeader(
  input: Uint8Array,
  imageOffset: number,
): [string, number] {
  const imageLengthOffset = imageOffset + ENTRY_LENGTH_OFFSET;
  if (imageLengthOffset + 4 > input.length) {
    throw new TypeError("Invalid ICNS");
  }
  const entryLength = readUInt32BE(input, imageLengthOffset);
  // An entry holds at least its own 8-byte header; anything smaller would never advance
  if (entryLength < 8) {
    throw new TypeError("Invalid ICNS");
  }
  return [toUTF8String(input, imageOffset, imageLengthOffset), entryLength];
}

function getImageSize(type: string): ISize {
  const size = ICON_TYPE_SIZE[type];
  return { width: size, height: size, type };
}

export const ICNS: IImage = {
  validate: (input) => toUTF8String(input, 0, 4) === "icns",

  calculate(input) {
    const inputLength = input.length;
    const fileLength = readUInt32BE(input, FILE_LENGTH_OFFSET);
    let imageOffset = SIZE_HEADER;

    const images: ISize[] = [];
    while (imageOffset < fileLength && imageOffset < inputLength) {
      const [type, entryLength] = readImageHeader(input, imageOffset);
      imageOffset += entryLength;
      // Skip entries that are not icons (e.g. "TOC ", "icnV", "info")
      if (type in ICON_TYPE_SIZE) {
        images.push(getImageSize(type));
      }
    }

    if (images.length === 0) {
      throw new TypeError("Invalid ICNS, no icons found");
    }

    if (images.length === 1) {
      return images[0];
    }

    return {
      height: images[0].height,
      images,
      width: images[0].width,
    };
  },
};
