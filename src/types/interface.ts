export interface ISize {
  width: number
  height: number
  type?: string
}

export interface ISizeCalculationResult extends ISize {
  orientation?: number
  images?: ISize[]
}

export interface IImageMeta extends ISizeCalculationResult {
  type: string
  mimeType: string
}

export interface IImage {
  validate: (buffer: Buffer) => boolean
  calculate: (buffer: Buffer, filepath?: string) => ISizeCalculationResult
}
