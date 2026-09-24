// NOTE: we only support non-hierarchical JPGs here
// due to the structure of the loader class, we only get a buffer
// with a maximum size of 4096 bytes. so if the SOF marker is outside
// if this range we can't detect the file size correctly.

import type { IImage, ISize } from "./interface.ts";
import { readUInt, readUInt16BE, toHexString } from "./utils.ts";

const EXIF_MARKER = "45786966";
const APP1_DATA_SIZE_BYTES = 2;
const EXIF_HEADER_BYTES = 6;
const TIFF_BYTE_ALIGN_BYTES = 2;
const BIG_ENDIAN_BYTE_ALIGN = "4d4d";
const LITTLE_ENDIAN_BYTE_ALIGN = "4949";

// The TIFF header is the byte align, the magic number (42) and the IFD0 offset
const TIFF_MAGIC = 42;
const TIFF_MAGIC_BYTES = 2;
const TIFF_HEADER_BYTES = 8;

// Each entry is exactly 12 bytes
const IDF_ENTRY_BYTES = 12;
const NUM_DIRECTORY_ENTRIES_BYTES = 2;

function isEXIF(input: Uint8Array): boolean {
  return toHexString(input, 2, 6) === EXIF_MARKER;
}

function extractSize(input: Uint8Array, index: number): ISize {
  return {
    height: readUInt16BE(input, index),
    width: readUInt16BE(input, index + 2),
  };
}

function extractOrientation(exifBlock: Uint8Array, isBigEndian: boolean) {
  // The byte align is followed by the TIFF magic number
  const magicOffset = EXIF_HEADER_BYTES + TIFF_BYTE_ALIGN_BYTES;
  if (readUInt(exifBlock, 16, magicOffset, isBigEndian) !== TIFF_MAGIC) {
    return;
  }

  // IDF offset works from right after the header bytes
  // (so the offset includes the tiff byte align)
  const idfOffset = readUInt(
    exifBlock,
    32,
    magicOffset + TIFF_MAGIC_BYTES,
    isBigEndian,
  );
  const offset = EXIF_HEADER_BYTES + idfOffset;

  // Skip if IFD0 overlaps the TIFF header or its entry count is outside the block
  // (a truncated header reads as NaN, which fails these checks too)
  const isInBounds =
    idfOffset >= TIFF_HEADER_BYTES &&
    offset + NUM_DIRECTORY_ENTRIES_BYTES <= exifBlock.length;
  if (!isInBounds) {
    return;
  }

  const idfDirectoryEntries = readUInt(exifBlock, 16, offset, isBigEndian);

  for (
    let directoryEntryNumber = 0;
    directoryEntryNumber < idfDirectoryEntries;
    directoryEntryNumber++
  ) {
    const start =
      offset +
      NUM_DIRECTORY_ENTRIES_BYTES +
      directoryEntryNumber * IDF_ENTRY_BYTES;
    const end = start + IDF_ENTRY_BYTES;

    // Skip on corrupt EXIF blocks
    if (start > exifBlock.length) {
      return;
    }

    const block = exifBlock.slice(start, end);
    const tagNumber = readUInt(block, 16, 0, isBigEndian);

    // 0x0112 (decimal: 274) is the `orientation` tag ID
    if (tagNumber === 274) {
      const dataFormat = readUInt(block, 16, 2, isBigEndian);
      if (dataFormat !== 3) {
        return;
      }

      // unsinged int has 2 bytes per component
      // if there would more than 4 bytes in total it's a pointer
      const numberOfComponents = readUInt(block, 32, 4, isBigEndian);
      if (numberOfComponents !== 1) {
        return;
      }

      return readUInt(block, 16, 8, isBigEndian);
    }
  }
}

function validateExifBlock(input: Uint8Array, index: number) {
  // Skip APP1 Data Size
  const exifBlock = input.slice(APP1_DATA_SIZE_BYTES, index);

  // Consider byte alignment
  const byteAlign = toHexString(
    exifBlock,
    EXIF_HEADER_BYTES,
    EXIF_HEADER_BYTES + TIFF_BYTE_ALIGN_BYTES,
  );

  // Ignore Empty EXIF. Validate byte alignment
  const isBigEndian = byteAlign === BIG_ENDIAN_BYTE_ALIGN;
  const isLittleEndian = byteAlign === LITTLE_ENDIAN_BYTE_ALIGN;

  if (isBigEndian || isLittleEndian) {
    return extractOrientation(exifBlock, isBigEndian);
  }
}

function validateInput(input: Uint8Array, index: number): void {
  // index should be within buffer limits
  if (index > input.length) {
    throw new TypeError("Corrupt JPG, exceeded buffer limits");
  }
}

// Find the 0xFF that starts the next marker, skipping extraneous bytes, 0xFF fill bytes
// and stuffed 0xFF 0x00 pairs (which are data, not markers)
function findMarker(input: Uint8Array, index: number): number {
  let marker = input.indexOf(0xff, index);
  while (marker !== -1) {
    while (input[marker + 1] === 0xff) {
      marker++;
    }
    if (input[marker + 1] !== 0x00) {
      return marker;
    }
    marker = input.indexOf(0xff, marker + 2);
  }
  throw new TypeError("Invalid JPG, marker table corrupted");
}

export const JPG: IImage = {
  validate: (input) => toHexString(input, 0, 2) === "ffd8",

  calculate(input) {
    // Skip the SOI marker (0xFFD8), it is the signature and has no length.
    // The first block may be the SOF itself, so its marker must be read too
    input = input.subarray(2);

    let orientation: number | undefined;
    let next: number;
    while (input.length > 0) {
      // Every JPEG block must begin with a 0xFF
      const marker = findMarker(input, 0);

      // 0xFFC0 is baseline standard(SOF)
      // 0xFFC1 is baseline optimized(SOF)
      // 0xFFC2 is progressive(SOF2)
      // 0xFFC3 is lossless(SOF3)
      // 0xFFC9 is arithmetic sequential(SOF9)
      // 0xFFCA is arithmetic progressive(SOF10)
      // 0xFFCB is arithmetic lossless(SOF11)
      // Differential SOF5-7 and SOF13-15 are skipped: they only occur in hierarchical
      // mode, where frames may be downscaled and the image size is in the DHP (0xFFDE)
      next = input[marker + 1];
      if ((next >= 0xc0 && next <= 0xc3) || (next >= 0xc9 && next <= 0xcb)) {
        const size = extractSize(input, marker + 5);

        // TODO: is orientation=0 a valid answer here?
        if (!orientation) {
          return size;
        }

        return {
          height: size.height,
          orientation,
          width: size.width,
        };
      }

      // 0xFFDA is the start of scan (SOS): entropy-coded data follows, and the frame
      // header (SOF) always comes before it, so an unsupported SOF type was used
      if (next === 0xda) {
        break;
      }

      // read length of the block, which follows its marker
      input = input.subarray(marker + 2);
      const i = readUInt16BE(input, 0);

      // ensure correct format
      validateInput(input, i);

      if (isEXIF(input)) {
        orientation = validateExifBlock(input, i);
      }

      // move to the next block
      input = input.subarray(i);
    }

    throw new TypeError("Invalid JPG, no size found");
  },
};
