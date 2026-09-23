# image-meta

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Codecov][codecov-src]][codecov-href]
[![bundle][bundle-src]][bundle-href]

Detect image type and size using pure JavaScript. It has no dependencies and works in Node.js, browsers and other runtimes.

## Usage

```ts
import { imageMeta } from "image-meta";

const res = await fetch(url);
const data = new Uint8Array(await res.arrayBuffer());

const meta = imageMeta(data);
// => { type: "png", width: 123, height: 456 }
```

In Node.js, a `Buffer` works as input because it is a `Uint8Array`:

```ts
import { readFile } from "node:fs/promises";
import { imageMeta } from "image-meta";

const meta = imageMeta(await readFile("./image.jpg"));
```

The type is detected from the file contents, not the file extension.

### Result

```ts
type ImageMeta = {
  type?: string; // detected format, e.g. "png"
  width: number | undefined;
  height: number | undefined;
  orientation?: number; // EXIF orientation (jpg)
  images?: Omit<ImageMeta, "images">[]; // all embedded images (ico, cur, icns)
};
```

### Error handling

`imageMeta` throws an error if the input is not a `Uint8Array`, the format is unsupported, or the data is invalid. Wrap calls that take untrusted input in `try/catch`:

```ts
try {
  const meta = imageMeta(data);
} catch (error) {
  // Not a supported image
}
```

## Supported formats

`avif`, `bmp`, `cur`, `dds`, `gif`, `heic`, `icns`, `ico`, `j2c`, `jp2`, `jpg`, `ktx`, `png`, `pnm`, `psd`, `svg`, `tga`, `tiff`, `webp`

## Development

- Clone this repository
- Install the latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

See [AGENTS.md](./AGENTS.md) for the project layout and how to add a new format.

## License

Made with 💛

🔀 Based on [image-size](https://github.com/image-size/image-size) by [Aditya Yadav](https://github.com/netroy) and [contributors](https://github.com/image-size/image-size/graphs/contributors).

Published under [MIT License](./LICENSE).

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/image-meta?style=flat&colorA=18181B&colorB=F0DB4F
[npm-version-href]: https://npmjs.com/package/image-meta
[npm-downloads-src]: https://img.shields.io/npm/dm/image-meta?style=flat&colorA=18181B&colorB=F0DB4F
[npm-downloads-href]: https://npmjs.com/package/image-meta
[codecov-src]: https://img.shields.io/codecov/c/gh/unjs/image-meta/main?style=flat&colorA=18181B&colorB=F0DB4F
[codecov-href]: https://codecov.io/gh/unjs/image-meta
[bundle-src]: https://img.shields.io/bundlephobia/minzip/image-meta?style=flat&colorA=18181B&colorB=F0DB4F
[bundle-href]: https://bundlephobia.com/result?p=image-meta
