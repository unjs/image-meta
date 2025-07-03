import type { IImage } from "./interface";
import { toUTF8String, readUInt32BE } from "./utils";

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
    const metaBox = findBox(input, "meta");
    if (!metaBox) throw new TypeError("heic: meta box not found");

    const iprpBox = findBox(
      input,
      "iprp",
      metaBox.offset + 12,
      metaBox.offset + metaBox.size,
    );
    if (!iprpBox) throw new TypeError("heic: iprp box not found");

    const ipcoBox = findBox(
      input,
      "ipco",
      iprpBox.offset + 8,
      iprpBox.offset + iprpBox.size,
    );
    if (!ipcoBox) throw new TypeError("heic: ipco box not found");

    // Collect all 'ispe' boxes and find the largest dimensions
    const dimensions = findAllBoxes(
      input,
      "ispe",
      ipcoBox.offset + 8,
      ipcoBox.offset + ipcoBox.size,
    ).map((box) => ({
      width: readUInt32BE(input, box.offset + 12),
      height: readUInt32BE(input, box.offset + 16),
    }));

    if (dimensions.length === 0)
      throw new TypeError("heic: ispe box not found");

    // Pick dimensions with largest area (width * height)
    let largestDimension = dimensions[0];

    for (let i = 1; i < dimensions.length; i++) {
      const curr = dimensions[i];
      if (
        curr.width * curr.height >
        largestDimension.width * largestDimension.height
      ) {
        largestDimension = curr;
      }
    }

    return largestDimension;
  },
};

function findBox(
  input: Uint8Array,
  type: string,
  startOffset = 0,
  endOffset = input.length,
) {
  let offset = startOffset;
  while (offset < endOffset) {
    const size = readUInt32BE(input, offset);
    const boxType = toUTF8String(input, offset + 4, offset + 8);

    if (boxType === type) {
      return { offset, size };
    }

    if (size <= 0 || offset + size > endOffset) {
      break;
    }

    offset += size;
  }
  return undefined;
}

function findAllBoxes(
  input: Uint8Array,
  type: string,
  startOffset = 0,
  endOffset = input.length,
) {
  let offset = startOffset;
  const boxes = [];

  while (offset < endOffset) {
    const size = readUInt32BE(input, offset);
    const boxType = toUTF8String(input, offset + 4, offset + 8);

    if (boxType === type) {
      boxes.push({ offset, size });
    }

    if (size <= 0 || offset + size > endOffset) {
      break;
    }

    offset += size;
  }

  return boxes;
}
