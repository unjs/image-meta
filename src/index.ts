import { typeHandlers, getMimeType } from './types'
import { detector } from './detector'
import type { IImageMeta } from './types/interface'

/**
 * Return size information based on a buffer
 *
 * @param {Buffer} buffer
 * @param {String} filepath
 * @returns {Object}
 */
function lookup (buffer: Buffer, filepath?: string): IImageMeta {
  // detect the file type.. don't rely on the extension
  const type = detector(buffer)

  // find an appropriate handler for this file type
  if (type && type in typeHandlers) {
    const size = typeHandlers[type].calculate(buffer, filepath)
    if (size !== undefined) {
      return {
        ...size,
        type,
        mimeType: getMimeType(type)
      }
    }
  }

  // throw up, if we don't understand the file
  throw new TypeError('unsupported file type: ' + type + ' (file: ' + filepath + ')')
}

/**
 * @param {Buffer} input - buffer of image data
 */
export function imageMeta (input: Buffer): IImageMeta {
  // Handle buffer input
  if (Buffer.isBuffer(input)) {
    return lookup(input)
  }

  throw new Error('Input should be buffer!')
}

export const types = Object.keys(typeHandlers)
