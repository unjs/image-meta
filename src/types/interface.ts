export type ImageMeta = {
  images?: Omit<ImageMeta, "images">[];

  width: number;
  height: number;
  orientation?: number;
  type?: string;

  // Best-effort hints read from the headers, left undefined when not known cheaply.
  // Not reliable for security decisions: a decoder may disagree on crafted files
  animated?: boolean;
  pages?: number;
};

export type ISize = ImageMeta; // Reduce refactor for types/*

export type IImage = {
  validate: (input: Uint8Array) => boolean;
  calculate: (input: Uint8Array, filepath?: string) => ImageMeta;
};
