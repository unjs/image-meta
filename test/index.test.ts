import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, describe } from "vitest";
import { imageMeta } from "../src/index.ts";

const fixtureDir = fileURLToPath(new URL("fixtures", import.meta.url));

describe("image-meta", () => {
  for (const fixtureType of ["valid", "invalid"]) {
    const isValid = fixtureType === "valid";
    describe(fixtureType, async () => {
      for (const format of await readdir(resolve(fixtureDir, fixtureType))) {
        describe(format, async () => {
          const formatDir = resolve(fixtureDir, fixtureType, format);
          for (const fileName of await readdir(formatDir)) {
            if (/\.(meta|md)$/.test(fileName)) {
              continue;
            }
            if (isValid) {
              test(fileName, async () => {
                const filePath = resolve(formatDir, fileName);
                const data = await readFile(filePath);
                const meta = imageMeta(data);
                expect(meta.type).toBe(format);
                await expect(meta).toMatchFileSnapshot(filePath + ".meta");
              });
            } else {
              test(fileName, async () => {
                const filePath = resolve(formatDir, fileName);
                const data = await readFile(filePath);
                expect(() => imageMeta(data)).toThrow();
              });
            }
          }
        });
      }
    });
  }

  test("svg: unterminated root does not backtrack quadratically", () => {
    // A root inside a comment passes `validate`, then `calculate` strips it
    const input = new TextEncoder().encode(
      "<!--<svg a>-->" + "<svg ".repeat(40_000),
    );
    const start = performance.now();
    expect(() => imageMeta(input)).toThrow(TypeError);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  test("svg: multi-MB root tag does not overflow the stack", () => {
    // Matching it with a backtracking regex threw a RangeError (from ~4M chars)
    const filler = "a".repeat(6 * 1024 * 1024);
    const unterminated = new TextEncoder().encode(
      "<!--<svg a>--><svg " + filler,
    );
    const start = performance.now();
    expect(() => imageMeta(unterminated)).toThrow(TypeError);
    expect(performance.now() - start).toBeLessThan(1000);
    const terminated = new TextEncoder().encode(
      `<!--<svg a>--><svg width="1" height="2" ${filler}>`,
    );
    expect(imageMeta(terminated)).toMatchObject({ width: 1, height: 2 });
  });

  test("pnm: many comment lines are not consumed quadratically", () => {
    const input = new TextEncoder().encode(
      "P2\n" + "#\n".repeat(200_000) + "1 1\n255\n",
    );
    const start = performance.now();
    expect(imageMeta(input)).toMatchObject({ width: 1, height: 1 });
    expect(performance.now() - start).toBeLessThan(1000);
  });

  test("pnm: pam header without size is not consumed quadratically", () => {
    // Without WIDTH and HEIGHT, every remaining line is scanned
    const input = new TextEncoder().encode("P7\n" + "a\n".repeat(200_000));
    const start = performance.now();
    expect(() => imageMeta(input)).toThrow(TypeError);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  test("heic: large ftyp compatible brands are scanned quickly", () => {
    // A generic major brand makes the detector look for avif in every compatible brand
    const input = new Uint8Array(16 * 1024 * 1024);
    new DataView(input.buffer).setUint32(0, input.length);
    input.set(new TextEncoder().encode("ftypmif1"), 4);
    const start = performance.now();
    expect(() => imageMeta(input)).toThrow(TypeError);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  test("heic: unknown input made of boxes is rejected quickly", () => {
    // Detection only checks for a file type box (ftyp) at the start of the input
    const input = new Uint8Array(16 * 1024 * 1024);
    const freeBox = new Uint8Array([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65]);
    for (let offset = 0; offset < input.length; offset += 8) {
      input.set(freeBox, offset);
    }
    const start = performance.now();
    expect(() => imageMeta(input)).toThrow(TypeError);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  test("heic: many top-level boxes are scanned quickly", () => {
    // Box types are compared as numbers, not decoded to strings one by one
    const input = new Uint8Array(16 * 1024 * 1024);
    const freeBox = new Uint8Array([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65]);
    for (let offset = 16; offset < input.length; offset += 8) {
      input.set(freeBox, offset);
    }
    new DataView(input.buffer).setUint32(0, 16);
    input.set(new TextEncoder().encode("ftypheic"), 4);
    const start = performance.now();
    expect(() => imageMeta(input)).toThrow(TypeError);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  test("icns: repeated entries are reported once per icon type", () => {
    // Alternating ic07 and ic08 entries, each an 8-byte header without data
    const input = new Uint8Array(8 + 1_000_000 * 8);
    const view = new DataView(input.buffer);
    const [ic07, ic08] = ["ic07", "ic08"].map((type) =>
      new TextEncoder().encode(type),
    );
    input.set(new TextEncoder().encode("icns"));
    view.setUint32(4, input.length);
    for (let offset = 8; offset < input.length; offset += 8) {
      input.set(offset % 16 ? ic07 : ic08, offset);
      view.setUint32(offset + 4, 8);
    }
    const meta = imageMeta(input);
    expect(meta).toMatchObject({ width: 256, height: 256 });
    expect(meta.images).toHaveLength(2);
  });

  describe("animated and pages", () => {
    const fixture = (path: string) =>
      readFile(resolve(fixtureDir, "valid", path));

    test("gif: truncated after two frames is animated, with unknown pages", async () => {
      const input = await fixture("gif/animated.gif");
      // Cut in the middle of the third frame
      const meta = imageMeta(input.subarray(0, -6));
      expect(meta.animated).toBe(true);
      expect(meta.pages).toBeUndefined();
    });

    test("gif: truncated after one frame is unknown", async () => {
      const input = await fixture("gif/sample.gif");
      const meta = imageMeta(input.subarray(0, -1));
      expect(meta.animated).toBeUndefined();
      expect(meta.pages).toBeUndefined();
    });

    test("gif: many tiny data sub-blocks are walked quickly", () => {
      // Header without a color table, then one image whose data is 1-byte sub-blocks
      const input = new Uint8Array(16 * 1024 * 1024).fill(1);
      input.set(new TextEncoder().encode("GIF89a"));
      input.set([1, 0, 1, 0, 0, 0, 0], 6);
      input.set([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2], 13);
      input.set([0, 0x3b], input.length - 2);
      const start = performance.now();
      expect(imageMeta(input)).toMatchObject({ animated: false, pages: 1 });
      expect(performance.now() - start).toBeLessThan(1000);
    });

    test("png: truncated before IDAT is unknown", async () => {
      const input = await fixture("png/sample.png");
      const meta = imageMeta(input.subarray(0, 40));
      expect(meta.animated).toBeUndefined();
      expect(meta.pages).toBeUndefined();
    });

    test("webp: truncated animation is animated, with unknown pages", async () => {
      const input = await fixture("webp/animated.webp");
      const meta = imageMeta(input.subarray(0, -10));
      expect(meta.animated).toBe(true);
      expect(meta.pages).toBeUndefined();
    });

    test("avif: sequence brand with a movie box is animated", async () => {
      // Brands of an image sequence (avis, msf1) on a still image, plus an empty moov box
      const input = await fixture("avif/sample-major-avis.avif");
      const moov = new Uint8Array([0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x76]);
      const meta = imageMeta(new Uint8Array([...input, ...moov]));
      expect(meta.animated).toBe(true);
    });

    test("jxl: have_animation is read after a preview header", () => {
      const bits: number[] = [];
      const write = (value: number, length: number) => {
        for (let i = 0; i < length; i++) bits.push((value >> i) & 1);
      };
      write(1, 1); // small size
      write(0, 5); // height 8
      write(1, 3); // 1:1 ratio
      write(0, 1); // not all_default
      write(1, 1); // extra_fields
      write(0, 3); // orientation
      write(0, 1); // no intrinsic size
      write(1, 1); // have_preview
      write(1, 1); // div8
      write(2, 2); // ysize selector: 5 bits
      write(3, 5);
      write(0, 3); // explicit xsize
      write(3, 2); // xsize selector: 9 bits
      write(7, 9);
      write(1, 1); // have_animation
      const input = new Uint8Array(2 + Math.ceil(bits.length / 8) + 8);
      input.set([0xff, 0x0a]);
      for (const [index, bit] of bits.entries()) {
        input[2 + (index >> 3)] |= bit << (index & 7);
      }
      expect(imageMeta(input)).toMatchObject({
        width: 8,
        height: 8,
        animated: true,
      });

      // Truncated after the size header: unknown
      const meta = imageMeta(input.subarray(0, 4));
      expect(meta).toMatchObject({ width: 8, height: 8 });
      expect(meta.animated).toBeUndefined();
    });

    test("tiff: IFD cycle leaves pages unknown", async () => {
      const input = new Uint8Array(await fixture("tiff/multipage.tiff"));
      // Point the last IFD (8 entries) back at the first one
      const view = new DataView(input.buffer);
      let offset = 8;
      for (let page = 0; page < 2; page++) {
        offset = view.getUint32(offset + 2 + 8 * 12, true);
      }
      view.setUint32(offset + 2 + 8 * 12, 8, true);
      const meta = imageMeta(input);
      expect(meta).toMatchObject({ width: 1, height: 1 });
      expect(meta.pages).toBeUndefined();
    });

    test("tiff: long IFD chain is capped quickly", async () => {
      // A valid first IFD, followed by a chain of empty IFDs (count 0, next offset)
      const first = await fixture("tiff/little-endian.tiff");
      const firstIfd = new DataView(first.buffer, first.byteOffset).getUint32(
        4,
        true,
      );
      const entries = new DataView(first.buffer, first.byteOffset).getUint16(
        firstIfd,
        true,
      );
      const nextPosition = firstIfd + 2 + entries * 12;
      const input = new Uint8Array(first.length + 6 * 200_000);
      input.set(first);
      const view = new DataView(input.buffer);
      view.setUint32(nextPosition, first.length, true);
      for (let offset = first.length; offset < input.length; offset += 6) {
        const next = offset + 6 < input.length ? offset + 6 : 0;
        view.setUint32(offset + 2, next, true);
      }
      const start = performance.now();
      const meta = imageMeta(input);
      expect(performance.now() - start).toBeLessThan(1000);
      expect(meta).toMatchObject({ width: 123, height: 456 });
      expect(meta.pages).toBeUndefined();
    });
  });
});
