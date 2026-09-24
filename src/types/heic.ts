import type { IImage } from "./interface.ts";
import { findBox, readUInt32BE, toTagCode, toUTF8String } from "./utils.ts";

type Size = { width: number; height: number };

const FTYP = toTagCode("ftyp");
const ISPE = toTagCode("ispe");
const CLAP = toTagCode("clap");

// Read the size of each image from the item properties (meta > iprp > ipco)
function readImageSizes(input: Uint8Array): Size[] {
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

  const images: Size[] = [];
  const end = ipcoBox.offset + ipcoBox.size;
  let offset = ipcoBox.offset + 8;
  while (offset + 8 <= end) {
    const size = readUInt32BE(input, offset);
    if (size < 8 || offset + size > end) {
      throw new TypeError("Invalid HEIF, corrupt ipco box");
    }
    const type = readUInt32BE(input, offset + 4);

    // Image spatial extents: full box header, then width and height
    if (type === ISPE) {
      if (size < 20) {
        throw new TypeError("Invalid HEIF, corrupt ispe box");
      }
      images.push({
        width: readUInt32BE(input, offset + 12),
        height: readUInt32BE(input, offset + 16),
      });
    }

    // Clean aperture crops the preceding image: width and height as fractions
    if (type === CLAP && size >= 24 && images.length > 0) {
      const image = images.at(-1)!;
      const widthD = readUInt32BE(input, offset + 12);
      const heightD = readUInt32BE(input, offset + 20);
      if (widthD > 0 && heightD > 0) {
        image.width = Math.round(readUInt32BE(input, offset + 8) / widthD);
        image.height = Math.round(readUInt32BE(input, offset + 16) / heightD);
      }
    }

    offset += size;
  }

  if (images.length === 0) {
    throw new TypeError("Invalid HEIF, no ispe box found");
  }
  return images;
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

  calculate: (input) => {
    // Pick dimensions with largest area (width * height)
    const [first, ...rest] = readImageSizes(input);
    let largest = first;
    for (const image of rest) {
      if (image.width * image.height > largest.width * largest.height) {
        largest = image;
      }
    }
    return largest;
  },
};
