export type ImageMeta = {
  images?: Omit<ImageMeta, "images">[];

  width: number | undefined;
  height: number | undefined;
  orientation?: number;
  type?: string;
};

export type ISize = ImageMeta; // Reduce refactor for types/*

export type IImage = {
  validate: (input: Uint8Array) => boolean;
  calculate: (input: Uint8Array, filepath?: string) => ImageMeta;
};
