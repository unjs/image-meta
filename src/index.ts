import { typeHandlers, getMimeType } from './types'
import { detector } from './detector'
import { ISizeCalculationResult } from './types/interface'

/**
 * Return size information based on a buffer
 *
 * @param {Buffer} buffer
 * @param {String} filepath
 * @returns {Object}
 */
function lookup (buffer: Buffer, filepath?: string): ISizeCalculationResult {
  // detect the file type.. don't rely on the extension
  const type = detector(buffer)

  // find an appropriate handler for this file type
  if (type && type in typeHandlers) {
    const size = typeHandlers[type].calculate(buffer, filepath)
    if (size !== undefined) {
      size.type = type
      size.mimeType = getMimeType(type)
      return size
    }
  }

  // throw up, if we don't understand the file
  throw new TypeError('unsupported file type: ' + type + ' (file: ' + filepath + ')')
}

/**
 * @param {Buffer|string} input - buffer of image data
 */
export function imageMeta (input: Buffer): ISizeCalculationResult | void {
  // Handle buffer input
  if (Buffer.isBuffer(input)) {
    return lookup(input)
  }

  throw new Error('Input should be buffer!')
}

export const types = Object.keys(typeHandlers)
