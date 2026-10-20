import type { IImage } from "./interface.ts";
import {
  findBox,
  readUInt16BE,
  readUInt32BE,
  toTagCode,
  toUTF8String,
} from "./utils.ts";

type Size = { width: number; height: number; orientation?: number };
type Box = { offset: number; size: number };
type Property = Box & { type: number };

const FTYP = toTagCode("ftyp");
const ISPE = toTagCode("ispe");
const CLAP = toTagCode("clap");
const IROT = toTagCode("irot");
const IMIR = toTagCode("imir");

// EXIF orientation for a horizontal mirror (`mirrored`) followed by a rotation of
// `turns` quarter turns anti-clockwise, the transforms `irot` and `imir` describe
const ORIENTATIONS = [
  [1, 8, 3, 6],
  [2, 5, 4, 7],
];

// Pick dimensions with largest area (width * height), keeping the earlier image on a tie
function larger(largest: Size | undefined, image: Size): Size {
  return !largest || image.width * image.height > largest.width * largest.height
    ? image
    : largest;
}

// Image spatial extents: full box header, then width and height
function readSpatialExtents(input: Uint8Array, box: Box): Size {
  if (box.size < 20) {
    throw new TypeError("Invalid HEIF, corrupt ispe box");
  }
  return {
    width: readUInt32BE(input, box.offset + 12),
    height: readUInt32BE(input, box.offset + 16),
  };
}

// Clean aperture crops an image: width and height as fractions
function applyCleanAperture(input: Uint8Array, box: Box, image: Size) {
  if (box.size < 24) {
    return;
  }
  const widthD = readUInt32BE(input, box.offset + 12);
  const heightD = readUInt32BE(input, box.offset + 20);
  if (widthD > 0 && heightD > 0) {
    image.width = Math.round(readUInt32BE(input, box.offset + 8) / widthD);
    image.height = Math.round(readUInt32BE(input, box.offset + 16) / heightD);
  }
}

// List the item properties (meta > iprp > ipco), in order: ipma refers to them by index
function readProperties(input: Uint8Array, ipcoBox: Box): Property[] {
  const properties: Property[] = [];
  const end = ipcoBox.offset + ipcoBox.size;
  let offset = ipcoBox.offset + 8;
  while (offset + 8 <= end) {
    const size = readUInt32BE(input, offset);
    if (size < 8 || offset + size > end) {
      throw new TypeError("Invalid HEIF, corrupt ipco box");
    }
    properties.push({ type: readUInt32BE(input, offset + 4), offset, size });
    offset += size;
  }
  return properties;
}

// Read the primary item ID (meta > pitm): 16-bit in version 0, 32-bit otherwise
function readPrimaryItemId(input: Uint8Array, metaBox: Box) {
  const pitmBox = findBox(
    input,
    "pitm",
    metaBox.offset + 12,
    metaBox.offset + metaBox.size,
  );
  if (!pitmBox) {
    return undefined;
  }
  const version = input[pitmBox.offset + 8];
  if (pitmBox.size < (version === 0 ? 14 : 16)) {
    return undefined;
  }
  return version === 0
    ? readUInt16BE(input, pitmBox.offset + 12)
    : readUInt32BE(input, pitmBox.offset + 12);
}

// Read the 1-based ipco indices of the properties associated with an item (iprp > ipma),
// null when the box does not list the item and undefined when it is malformed
function readItemAssociations(
  input: Uint8Array,
  ipmaBox: Box,
  itemId: number,
): number[] | null | undefined {
  const end = ipmaBox.offset + ipmaBox.size;
  const version = input[ipmaBox.offset + 8];
  const largeIndex = (input[ipmaBox.offset + 11] & 1) === 1;
  const idSize = version === 0 ? 2 : 4;
  const indexSize = largeIndex ? 2 : 1;
  let offset = ipmaBox.offset + 16;
  if (offset > end) {
    return undefined;
  }
  const entryCount = readUInt32BE(input, offset - 4);
  for (let entry = 0; entry < entryCount; entry++) {
    if (offset + idSize + 1 > end) {
      return undefined;
    }
    const id =
      idSize === 2 ? readUInt16BE(input, offset) : readUInt32BE(input, offset);
    const count = input[offset + idSize];
    offset += idSize + 1;
    if (offset + count * indexSize > end) {
      return undefined;
    }
    if (id === itemId) {
      const indices: number[] = [];
      for (let i = 0; i < count; i++, offset += indexSize) {
        // The top bit flags the association as essential
        indices.push(
          largeIndex
            ? readUInt16BE(input, offset) & 0x7f_ff
            : input[offset] & 0x7f,
        );
      }
      return indices;
    }
    offset += count * indexSize;
  }
  // The item is not in this box, a later ipma box may list it
  return null;
}

// Read the size and orientation of the primary item from its associated properties
function readPrimaryImageSize(
  input: Uint8Array,
  metaBox: Box,
  iprpBox: Box,
  properties: Property[],
): Size | undefined {
  const itemId = readPrimaryItemId(input, metaBox);
  if (itemId === undefined) {
    return undefined;
  }

  // There may be several ipma boxes, one per version and flags combination
  const end = iprpBox.offset + iprpBox.size;
  let indices: number[] | null | undefined = null;
  for (
    let ipmaBox = findBox(input, "ipma", iprpBox.offset + 8, end);
    ipmaBox && indices === null;
    ipmaBox = findBox(input, "ipma", ipmaBox.offset + ipmaBox.size, end)
  ) {
    indices = readItemAssociations(input, ipmaBox, itemId);
  }
  if (!indices) {
    return undefined;
  }

  let image: Size | undefined;
  let transformed = false;
  let turns = 0;
  let mirrored = 0;
  // Transformative properties (clap, irot, imir) apply in association order
  for (const index of indices) {
    const box = properties[index - 1];
    if (!box) {
      continue;
    }
    if (box.type === ISPE) {
      image ??= readSpatialExtents(input, box);
    } else if (box.type === CLAP && image) {
      applyCleanAperture(input, box, image);
    } else if (box.type === IROT && box.size >= 9) {
      transformed = true;
      turns = (turns + (input[box.offset + 8] & 3)) % 4;
    } else if (box.type === IMIR && box.size >= 9) {
      // Mode (axis) 0 flips top and bottom, 1 flips left and right, as libheif and libavif do
      transformed = true;
      turns = ((input[box.offset + 8] & 1) * 2 + 6 - turns) % 4;
      mirrored ^= 1;
    }
  }

  if (image && transformed) {
    // Dimensions are reported as stored, like the EXIF orientation of JPEG files
    image.orientation = ORIENTATIONS[mirrored][turns];
  }
  return image;
}

// Read the size of the largest image, for files without primary item associations
function readLargestImageSize(input: Uint8Array, properties: Property[]): Size {
  // Track the largest image so far and the latest one, which a following clap box may
  // still crop, instead of collecting a size per ispe box
  let largest: Size | undefined;
  let image: Size | undefined;
  for (const box of properties) {
    if (box.type === ISPE) {
      const extents = readSpatialExtents(input, box);
      // A new image starts, so the previous one can no longer be cropped
      if (image) {
        largest = larger(largest, image);
      }
      image = extents;
    }

    // Clean aperture crops the preceding image
    if (box.type === CLAP && image) {
      applyCleanAperture(input, box, image);
    }
  }

  if (!image) {
    throw new TypeError("Invalid HEIF, no ispe box found");
  }
  return larger(largest, image);
}

// Read the size of the primary image, falling back to the largest one
function readImageSize(input: Uint8Array): Size {
  const metaBox = findBox(input, "meta");
  const iprpBox =
    metaBox &&
    findBox(input, "iprp", metaBox.offset + 12, metaBox.offset + metaBox.size);
  const ipcoBox =
    iprpBox &&
    findBox(input, "ipco", iprpBox.offset + 8, iprpBox.offset + iprpBox.size);
  if (!ipcoBox) {
    throw new TypeError("Invalid HEIF, no ipco box found");
  }
  const properties = readProperties(input, ipcoBox);
  return (
    readPrimaryImageSize(input, metaBox, iprpBox, properties) ??
    readLargestImageSize(input, properties)
  );
}

// AVIF still image and image sequence brands, compared as 32-bit codes to scan quickly
const AVIF_BRANDS = new Set(["avif", "avis"].map((brand) => toTagCode(brand)));

// Tell AVIF from HEIC by the brands of the file type box (ftyp)
export function detectHeifType(input: Uint8Array): "avif" | "heic" | undefined {
  // ISO BMFF files start with the file type box, so only offset 0 is checked:
  // arbitrary input is then rejected without walking all of its boxes
  const ftypSize = readUInt32BE(input, 0);
  if (
    readUInt32BE(input, 4) !== FTYP ||
    ftypSize < 12 ||
    ftypSize > input.length
  ) {
    return undefined;
  }

  // Major brand, minor version, then compatible brands up to the end of the box
  if (AVIF_BRANDS.has(readUInt32BE(input, 8))) return "avif";

  // AVIF may have a generic HEIF / MIAF major brand and list avif or avis as compatible
  const majorBrand = toUTF8String(input, 8, 12);
  if (["mif1", "msf1", "miaf"].includes(majorBrand)) {
    for (let offset = 16; offset + 4 <= ftypSize; offset += 4) {
      if (AVIF_BRANDS.has(readUInt32BE(input, offset))) return "avif";
    }
  }

  return ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(majorBrand)
    ? "heic"
    : undefined;
}

export const HEIC: IImage = {
  validate: (input) => detectHeifType(input) === "heic",

  calculate: (input) => readImageSize(input),
};
