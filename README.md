# image-meta

[![npm version][npm-v-src]][npm-v-href]
[![npm downloads][npm-d-src]][npm-d-href]
[![bundle phobia][bundlephobia-src]][bundlephobia-href]


Using yarn:

```
yarn add image-meta
```

Using npm:

```
npm install image-meta
```

Usage:

```ts
import imageMeta from 'image-meta'
import fetch from 'node-fetch'

const data = await fetch(url).then(res => res.buffer())
const { width, height, mimeType } = await imageMeta(data)
```

**Note:** This package only works with Node.js because of `Buffer` dependency!

## License

[MIT](./LICENSE) - Based on [image-size](https://github.com/image-size/image-size)

<!-- Refs -->
[npm-v-src]: https://img.shields.io/npm/v/image-meta?style=flat-square
[npm-v-href]: https://npmjs.com/package/image-meta

[npm-d-src]: https://img.shields.io/npm/dm/image-meta?style=flat-square
[npm-d-href]: https://npmjs.com/package/image-meta

[github-actions-src]: https://img.shields.io/github/workflow/status/nuxt-contrib/image-meta/ci/master?style=flat-square
[github-actions-href]: https://github.com/nuxt-contrib/image-meta/actions?query=workflow%3Aci

[bundlephobia-src]: https://img.shields.io/bundlephobia/min/image-meta?style=flat-square
[bundlephobia-href]: https://bundlephobia.com/result?p=image-meta
