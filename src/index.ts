import { typeHandlers } from "./types/index.ts";
import { detector } from "./detector.ts";
import type { ImageMeta } from "./types/interface.ts";

export type { ImageMeta } from "./types/interface.ts";

/**
 * @param {Uint8Array|string} input - Uint8Array or relative/absolute path of the image file
 * @param {Function=} [callback] - optional function for async detection
 */
export function imageMeta(input: Uint8Array): ImageMeta {
  if (!(input instanceof Uint8Array)) {
    throw new TypeError("Input should be a Uint8Array");
  }

  // Detect the file type.. don't rely on the extension
  const type = detector(input);

  // Find an appropriate handler for this file type
  if (type !== undefined && type in typeHandlers) {
    const size = typeHandlers[type].calculate(input);
    if (size !== undefined) {
      // Report the largest image when the file holds several (e.g. icons)
      if (size.images && size.images.length > 1) {
        for (const image of size.images) {
          if (image.width * image.height > size.width * size.height) {
            size.width = image.width;
            size.height = image.height;
          }
        }
      }

      // Reading past the end of a truncated input yields NaN or undefined, and a text header
      // (svg, pnm) can declare a size too large to be exact (e.g. `width="1e20"`)
      if (
        !Number.isSafeInteger(size.width) ||
        !Number.isSafeInteger(size.height)
      ) {
        throw new TypeError(`Invalid ${type}, truncated or corrupt input`);
      }
      // A zero height is allowed for one-dimensional textures (ktx)
      if (size.width <= 0 || size.height < 0) {
        throw new TypeError(`Invalid ${type}, zero or negative size`);
      }
      size.type = type;
      return size;
    }
  }

  // Throw up, if we don't understand the file
  throw new TypeError(`Unsupported file type: ${type}`);
}
