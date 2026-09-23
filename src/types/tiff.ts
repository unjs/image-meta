// based on http://www.compix.com/fileformattif.htm
// and https://www.awaresystems.be/imaging/tiff/bigtiff.html
import { readUInt, toHexString, toUTF8String } from "./utils";
import type { IImage } from "./interface";

const TAG_WIDTH = 256;
const TAG_HEIGHT = 257;

const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_LONG8 = 16;

// Read a 64-bit unsigned integer, as long as it fits in a safe integer
function readUInt64(input: Uint8Array, offset: number, isBigEndian: boolean) {
  const high = readUInt(input, 32, offset + (isBigEndian ? 0 : 4), isBigEndian);
  const low = readUInt(input, 32, offset + (isBigEndian ? 4 : 0), isBigEndian);
  if (high > 0x1f_ff_ff) {
    throw new TypeError("Invalid Tiff. Value too large");
  }
  return high * 2 ** 32 + low;
}

// Read the value of a tag stored inline in the IFD entry
function readValue(
  input: Uint8Array,
  type: number,
  offset: number,
  isBigEndian: boolean,
): number | undefined {
  switch (type) {
    case TYPE_SHORT: {
      return readUInt(input, 16, offset, isBigEndian);
    }
    case TYPE_LONG: {
      return readUInt(input, 32, offset, isBigEndian);
    }
    case TYPE_LONG8: {
      return readUInt64(input, offset, isBigEndian);
    }
  }
}

const signatures = new Set([
  "49492a00", // Little endian
  "4d4d002a", // Big Endian
  "49492b00", // BigTIFF Little Endian
  "4d4d002b", // BigTIFF Big Endian
]);

export const TIFF: IImage = {
  validate: (input) => signatures.has(toHexString(input, 0, 4)),

  calculate(input) {
    const isBigEndian = toUTF8String(input, 0, 2) === "MM";
    const isBigTiff = readUInt(input, 16, 2, isBigEndian) === 43;

    // Locate the first IFD (image-file-directory) and its entry layout
    let entryCount: number;
    let entriesOffset: number;
    let entrySize: number;
    if (isBigTiff) {
      // BigTIFF header: offset byte size (always 8) and a reserved zero
      const byteSize = readUInt(input, 16, 4, isBigEndian);
      const reserved = readUInt(input, 16, 6, isBigEndian);
      if (byteSize !== 8 || reserved !== 0) {
        throw new TypeError("Invalid BigTIFF header");
      }
      const ifdOffset = readUInt64(input, 8, isBigEndian);
      entryCount = readUInt64(input, ifdOffset, isBigEndian);
      entriesOffset = ifdOffset + 8;
      entrySize = 20;
    } else {
      const ifdOffset = readUInt(input, 32, 4, isBigEndian);
      entryCount = readUInt(input, 16, ifdOffset, isBigEndian);
      entriesOffset = ifdOffset + 2;
      entrySize = 12;
    }

    // Each entry: tag (2), type (2), count (4 or 8), then the value (4 or 8)
    const tags: Record<number, number | undefined> = {};
    for (let index = 0; index < entryCount; index++) {
      const offset = entriesOffset + index * entrySize;
      if (offset + entrySize > input.length) {
        break;
      }
      const code = readUInt(input, 16, offset, isBigEndian);
      const type = readUInt(input, 16, offset + 2, isBigEndian);
      const length = isBigTiff
        ? readUInt64(input, offset + 4, isBigEndian)
        : readUInt(input, 32, offset + 4, isBigEndian);
      if (length === 1) {
        tags[code] = readValue(
          input,
          type,
          offset + (isBigTiff ? 12 : 8),
          isBigEndian,
        );
      }
      if (tags[TAG_WIDTH] && tags[TAG_HEIGHT]) {
        break;
      }
    }

    const width = tags[TAG_WIDTH];
    const height = tags[TAG_HEIGHT];

    if (!width || !height) {
      throw new TypeError("Invalid Tiff. Missing tags");
    }

    return { height, width };
  },
};
