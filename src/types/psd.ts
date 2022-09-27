import type { IImage } from './interface'

export const PSD: IImage = {
  validate (buffer) {
    return (buffer.toString('ascii', 0, 4) === '8BPS')
  },

  calculate (buffer) {
    return {
      height: buffer.readUInt32BE(14),
      width: buffer.readUInt32BE(18)
    }
  }
}
