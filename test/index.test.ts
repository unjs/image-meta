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
});
