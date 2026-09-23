import type { IImage } from "./interface";
import { findBox, readUInt32BE, toUTF8String } from "./utils";

type Size = { width: number; height: number };

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
    const name = toUTF8String(input, offset + 4, offset + 8);

    // Image spatial extents: full box header, then width and height
    if (name === "ispe") {
      if (size < 20) {
        throw new TypeError("Invalid HEIF, corrupt ispe box");
      }
      images.push({
        width: readUInt32BE(input, offset + 12),
        height: readUInt32BE(input, offset + 16),
      });
    }

    // Clean aperture crops the preceding image: width and height as fractions
    if (name === "clap" && size >= 24 && images.length > 0) {
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

export const HEIC: IImage = {
  validate: (input) => {
    const ftypBox = findBox(input, "ftyp");
    if (!ftypBox) return false;

    const majorBrand = toUTF8String(
      input,
      ftypBox.offset + 8,
      ftypBox.offset + 12,
    );
    return ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(
      majorBrand,
    );
  },

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
