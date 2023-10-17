import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, describe } from "vitest";
import { imageMeta } from "../src";

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
                expect(meta).toMatchFileSnapshot(filePath + ".meta");
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
});
