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
});
