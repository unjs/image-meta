import type { IImage } from "./interface";
import { toUTF8String, readUInt32BE } from "./utils";

export const AVIF: IImage = {
  validate: (input) => toUTF8String(input, 8, 12) === "avif",

  calculate: (input) => {
    function findBox(input: Uint8Array, type: string, startOffset = 0, endOffset = input.length) {
      for (let offset = startOffset; offset < endOffset;) {
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
      throw new Error(`${type} box not found`);
    }

    const metaBox = findBox(input, 'meta');
    const iprpBox = findBox(input, 'iprp', metaBox.offset + 12, metaBox.offset + metaBox.size);
    const ipcoBox = findBox(input, 'ipco', iprpBox.offset + 8, iprpBox.offset + iprpBox.size);
    const ispeBox = findBox(input, 'ispe', ipcoBox.offset + 8, ipcoBox.offset + ipcoBox.size);

    const width = readUInt32BE(input, ispeBox.offset + 12);
    const height = readUInt32BE(input, ispeBox.offset + 16);

    return { width, height };
  }
};
