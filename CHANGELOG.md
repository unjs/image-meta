# Changelog


## v0.3.0

[compare changes](https://github.com/unjs/image-meta/compare/v0.2.2...v0.3.0)

### 🚀 Enhancements

- **tiff:** Support BigTIFF ([4e754b0](https://github.com/unjs/image-meta/commit/4e754b0))
- **ktx:** Support KTX 2.0 ([7a766b9](https://github.com/unjs/image-meta/commit/7a766b9))
- Support JPEG XL ([c9e5e6b](https://github.com/unjs/image-meta/commit/c9e5e6b))
- ⚠️  Report the largest image of multi-image files ([ccd03d3](https://github.com/unjs/image-meta/commit/ccd03d3))
- **jpg:** Support lossless and arithmetic-coded frames ([94c7ec7](https://github.com/unjs/image-meta/commit/94c7ec7))

### 🔥 Performance

- Compare box types and segment markers as numbers instead of decoded strings ([5e2eea3](https://github.com/unjs/image-meta/commit/5e2eea3))

### 🩹 Fixes

- **svg:** Ignore an `<svg>` tag inside an XML comment ([#78](https://github.com/unjs/image-meta/pull/78))
- **icns:** Reject truncated and zero-length entries ([8a1da94](https://github.com/unjs/image-meta/commit/8a1da94))
- **ico:** Validate image count against input length ([d5806a3](https://github.com/unjs/image-meta/commit/d5806a3))
- **tiff:** Read big-endian LONG tag values correctly ([ec7ab13](https://github.com/unjs/image-meta/commit/ec7ab13))
- **heic, avif:** Apply clean aperture crop and validate boxes ([3a69171](https://github.com/unjs/image-meta/commit/3a69171))
- **jpg:** Skip extraneous bytes between segments ([cda47ea](https://github.com/unjs/image-meta/commit/cda47ea))
- **icns:** Skip non-icon entries ([cde19af](https://github.com/unjs/image-meta/commit/cde19af))
- Throw on truncated input instead of returning NaN sizes ([92fc71e](https://github.com/unjs/image-meta/commit/92fc71e))
- **j2c:** Subtract the image offset from the reference grid size ([db4da5e](https://github.com/unjs/image-meta/commit/db4da5e))
- **svg:** Parse viewBox values separated by commas or extra whitespace ([871ded8](https://github.com/unjs/image-meta/commit/871ded8))
- Propagate NaN from signed readers on truncated input ([6f1ecc3](https://github.com/unjs/image-meta/commit/6f1ecc3))
- Reject zero width and negative sizes ([4a6da3d](https://github.com/unjs/image-meta/commit/4a6da3d))
- **tiff:** Harden IFD parsing ([c136a90](https://github.com/unjs/image-meta/commit/c136a90))
- **jpg:** Stop at start of scan and skip stuffed bytes when resyncing ([31fe1f0](https://github.com/unjs/image-meta/commit/31fe1f0))
- **jxl:** Read container codestream boxes without copying or requiring the whole box ([a79283b](https://github.com/unjs/image-meta/commit/a79283b))
- **icns:** Add missing icon types and correct ic12 size ([bfd5919](https://github.com/unjs/image-meta/commit/bfd5919))
- **svg:** Only match root at first <svg> tag to avoid quadratic backtracking ([198a89d](https://github.com/unjs/image-meta/commit/198a89d))
- **pnm:** Read header lines lazily to avoid quadratic shift() and whole-input decode ([2c6374a](https://github.com/unjs/image-meta/commit/2c6374a))
- **svg:** Correct pica (pc) unit conversion to 16px ([fc522ba](https://github.com/unjs/image-meta/commit/fc522ba))
- **svg:** Keep viewBox precision and round derived size to nearest pixel ([d7b8fe9](https://github.com/unjs/image-meta/commit/d7b8fe9))
- **pnm:** Parse header tokens separated by any whitespace and comments ([777135e](https://github.com/unjs/image-meta/commit/777135e))
- **jpg:** Inspect the first segment marker after SOI ([d0a2ea1](https://github.com/unjs/image-meta/commit/d0a2ea1))
- **jpg:** Read EXIF IFD0 offset from the TIFF header ([61ff67d](https://github.com/unjs/image-meta/commit/61ff67d))
- **bmp:** Read OS/2 v1 core header size as 16-bit and reject negative width ([4f8b659](https://github.com/unjs/image-meta/commit/4f8b659))
- **ktx:** Honor the KTX 1.1 endianness field for big-endian files ([d581fc9](https://github.com/unjs/image-meta/commit/d581fc9))
- **avif:** Detect AVIF from ftyp compatible brands and avis sequences ([3c56c47](https://github.com/unjs/image-meta/commit/3c56c47))
- **icns, heic:** Bound memory on repeated icon entries and ispe boxes ([72684e7](https://github.com/unjs/image-meta/commit/72684e7))
- **svg:** Find the root tag with a byte scan instead of a backtracking regex ([9a90ba2](https://github.com/unjs/image-meta/commit/9a90ba2))
- Reject image sizes that are not safe integers ([b605abf](https://github.com/unjs/image-meta/commit/b605abf))

### 💅 Refactors

- **jp2:** Locate the ihdr box instead of assuming box order ([7e652be](https://github.com/unjs/image-meta/commit/7e652be))

### 📦 Build

- ⚠️  Migrate to obuild and drop cjs build ([3e97b7b](https://github.com/unjs/image-meta/commit/3e97b7b))

### 🌊 Types

- Width and height are always numbers ([336a3c2](https://github.com/unjs/image-meta/commit/336a3c2))

### 🏡 Chore

- Update deps ([99f0b8a](https://github.com/unjs/image-meta/commit/99f0b8a))
- Downgrade typescript to v6 ([1bdaeaa](https://github.com/unjs/image-meta/commit/1bdaeaa))
- Update docs ([ca836c2](https://github.com/unjs/image-meta/commit/ca836c2))
- Apply automated updates ([3a4759f](https://github.com/unjs/image-meta/commit/3a4759f))
- Modernize tsconfig and run src with node type stripping ([146f8c1](https://github.com/unjs/image-meta/commit/146f8c1))

### ✅ Tests

- Add invalid webp and empty file fixtures from image-size ([9a25070](https://github.com/unjs/image-meta/commit/9a25070))

### 🤖 CI

- Bump node ([eba9410](https://github.com/unjs/image-meta/commit/eba9410))

#### ⚠️ Breaking Changes

- ⚠️  Report the largest image of multi-image files ([ccd03d3](https://github.com/unjs/image-meta/commit/ccd03d3))
- ⚠️  Migrate to obuild and drop cjs build ([3e97b7b](https://github.com/unjs/image-meta/commit/3e97b7b))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))
- Mochammad Fadhlan Al-Ghiffari ([@MFA-G](https://github.com/MFA-G))

## v0.2.2

[compare changes](https://github.com/unjs/image-meta/compare/v0.2.1...v0.2.2)

### 🚀 Enhancements

- Add heic support ([#55](https://github.com/unjs/image-meta/pull/55))

### 🏡 Chore

- Add credits ([9cf9dbf](https://github.com/unjs/image-meta/commit/9cf9dbf))
- Update deps ([498c032](https://github.com/unjs/image-meta/commit/498c032))

### ❤️ Contributors

- Pooya Parsa ([@pi0](https://github.com/pi0))
- Anudit Nagar ([@aapkasaarthi](https://github.com/aapkasaarthi))

## v0.2.1

[compare changes](https://github.com/unjs/image-meta/compare/v0.2.0...v0.2.1)

### 🚀 Enhancements

- Add `avif` format support ([#16](https://github.com/unjs/image-meta/pull/16))
- Add `tiff` size detection support ([#3](https://github.com/unjs/image-meta/pull/3))

### 🏡 Chore

- Update deps ([252db25](https://github.com/unjs/image-meta/commit/252db25))
- Update eslint to v9 ([8787407](https://github.com/unjs/image-meta/commit/8787407))
- Update tsconfig to be more strict ([f912ec2](https://github.com/unjs/image-meta/commit/f912ec2))
- Add eslint config ([d727d96](https://github.com/unjs/image-meta/commit/d727d96))
- Update ci ([869dbf2](https://github.com/unjs/image-meta/commit/869dbf2))

### ❤️ Contributors

- Sebastian Bosse ([@SebastianBosse](http://github.com/SebastianBosse))
- Pooya Parsa ([@pi0](http://github.com/pi0))
- Tasiotas <tasiotas@gmail.com>

