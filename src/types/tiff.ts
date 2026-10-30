// based on http://www.compix.com/fileformattif.htm
// and https://www.awaresystems.be/imaging/tiff/bigtiff.html
import { readUInt, toHexString, toUTF8String } from "./utils.ts";
import type { IImage } from "./interface.ts";

const TAG_WIDTH = 256;
const TAG_HEIGHT = 257;

const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_LONG8 = 16;

// libtiff rejects directories with more entries than this
const MAX_ENTRIES = 4096;

// Stop following the IFD chain after this many directories
const MAX_PAGES = 65_536;

// Read a 64-bit unsigned integer (imprecise above Number.MAX_SAFE_INTEGER)
function readUInt64(input: Uint8Array, offset: number, isBigEndian: boolean) {
  const high = readUInt(input, 32, offset + (isBigEndian ? 0 : 4), isBigEndian);
  const low = readUInt(input, 32, offset + (isBigEndian ? 4 : 0), isBigEndian);
  return high * 2 ** 32 + low;
}

// Read the value of a tag stored inline in the IFD entry
function readValue(
  input: Uint8Array,
  type: number,
  offset: number,
  isBigEndian: boolean,
  isBigTiff: boolean,
): number | undefined {
  switch (type) {
    case TYPE_SHORT: {
      return readUInt(input, 16, offset, isBigEndian);
    }
    case TYPE_LONG: {
      return readUInt(input, 32, offset, isBigEndian);
    }
    case TYPE_LONG8: {
      // LONG8 only exists in BigTIFF, where the value field is 8 bytes
      if (!isBigTiff) {
        return undefined;
      }
      const value = readUInt64(input, offset, isBigEndian);
      if (!Number.isSafeInteger(value)) {
        throw new TypeError("Invalid Tiff. Value too large");
      }
      return value;
    }
  }
}

// Count the IFDs by following the chain of next-IFD offsets, without reading their entries.
// The count is unknown when the chain is truncated, loops, or is too long
function countPages(
  input: Uint8Array,
  ifdOffset: number,
  isBigEndian: boolean,
  isBigTiff: boolean,
): number | undefined {
  const seen = new Set<number>();
  let offset = ifdOffset;
  while (offset !== 0) {
    if (seen.has(offset) || seen.size >= MAX_PAGES) {
      return undefined;
    }
    seen.add(offset);
    // Entry count, entries, then the offset of the next IFD
    const nextOffset = isBigTiff
      ? offset + 8 + readUInt64(input, offset, isBigEndian) * 20
      : offset + 2 + readUInt(input, 16, offset, isBigEndian) * 12;
    if (!(nextOffset + (isBigTiff ? 8 : 4) <= input.length)) {
      return undefined;
    }
    offset = isBigTiff
      ? readUInt64(input, nextOffset, isBigEndian)
      : readUInt(input, 32, nextOffset, isBigEndian);
  }
  return seen.size;
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
    let ifdOffset: number;
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
      ifdOffset = readUInt64(input, 8, isBigEndian);
      if (!(ifdOffset + 8 <= input.length)) {
        throw new TypeError("Invalid Tiff. IFD offset out of bounds");
      }
      entryCount = readUInt64(input, ifdOffset, isBigEndian);
      entriesOffset = ifdOffset + 8;
      entrySize = 20;
    } else {
      ifdOffset = readUInt(input, 32, 4, isBigEndian);
      if (!(ifdOffset + 2 <= input.length)) {
        throw new TypeError("Invalid Tiff. IFD offset out of bounds");
      }
      entryCount = readUInt(input, 16, ifdOffset, isBigEndian);
      entriesOffset = ifdOffset + 2;
      entrySize = 12;
    }

    // Each entry: tag (2), type (2), count (4 or 8), then the value (4 or 8)
    const tags: Record<number, number | undefined> = {};
    for (let index = 0; index < Math.min(entryCount, MAX_ENTRIES); index++) {
      const offset = entriesOffset + index * entrySize;
      if (offset + entrySize > input.length) {
        break;
      }
      const code = readUInt(input, 16, offset, isBigEndian);
      const type = readUInt(input, 16, offset + 2, isBigEndian);
      // Only single values are stored inline, so only those can be the size
      const count = isBigTiff
        ? readUInt64(input, offset + 4, isBigEndian)
        : readUInt(input, 32, offset + 4, isBigEndian);
      if (count === 1) {
        tags[code] = readValue(
          input,
          type,
          offset + (isBigTiff ? 12 : 8),
          isBigEndian,
          isBigTiff,
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

    const pages = countPages(input, ifdOffset, isBigEndian, isBigTiff);
    return pages === undefined ? { height, width } : { height, width, pages };
  },
};
