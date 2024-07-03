// based on http://www.compix.com/fileformattif.htm
// TO-DO: support big-endian as well
import { readUInt, toHexString, toUTF8String } from "./utils";
import type { IImage } from "./interface";

// Read IFD (image-file-directory) into a buffer
function readIFD(buffer: Uint8Array, isBigEndian: boolean) {
  const ifdOffset = readUInt(buffer, 32, 4, isBigEndian);

  // read only till the end of the file
  let bufferSize = 1024;
  const fileSize = buffer.length;
  if (ifdOffset + bufferSize > fileSize) {
    bufferSize = fileSize - ifdOffset - 10;
  }

  return buffer.slice(ifdOffset + 2, ifdOffset + 2 + bufferSize);
}

// TIFF values seem to be messed up on Big-Endian, this helps
function readValue(buffer: Uint8Array, isBigEndian: boolean): number {
  const low = readUInt(buffer, 16, 8, isBigEndian);
  const high = readUInt(buffer, 16, 10, isBigEndian);
  return (high << 16) + low;
}

// move to the next tag
function nextTag(buffer: Uint8Array) {
  if (buffer.length > 24) {
    return buffer.slice(12);
  }
}

// Extract IFD tags from TIFF metadata
function extractTags(buffer: Uint8Array, isBigEndian: boolean) {
  const tags: { [key: number]: number } = {};

  let temp: Uint8Array | undefined = buffer;
  while (temp && temp.length > 0) {
    const code = readUInt(temp, 16, 0, isBigEndian);
    const type = readUInt(temp, 16, 2, isBigEndian);
    const length = readUInt(temp, 32, 4, isBigEndian);

    // 0 means end of IFD
    if (code === 0) {
      break;
    } else {
      // 256 is width, 257 is height
      // if (code === 256 || code === 257) {
      if (length === 1 && (type === 3 || type === 4)) {
        tags[code] = readValue(temp, isBigEndian);
      }

      // move to the next tag
      temp = nextTag(temp);
    }
  }

  return tags;
}

// Test if the TIFF is Big Endian or Little Endian
function determineEndianness(input: Uint8Array) {
  const signature = toUTF8String(input, 0, 2);
  if (signature === "II") {
    return "LE";
  } else if (signature === "MM") {
    return "BE";
  }
}

const signatures = new Set([
  // '492049', // currently not supported
  "49492a00", // Little endian
  "4d4d002a", // Big Endian
  // '4d4d002a', // BigTIFF > 4GB. currently not supported
]);

export const TIFF: IImage = {
  validate: (input) => signatures.has(toHexString(input, 0, 4)),

  calculate(input) {
    // Determine BE/LE
    const isBigEndian = determineEndianness(input) === "BE";

    // read the IFD
    const ifdBuffer = readIFD(input, isBigEndian);

    // extract the tags from the IFD
    const tags = extractTags(ifdBuffer, isBigEndian);

    const width = tags[256];
    const height = tags[257];

    if (!width || !height) {
      throw new TypeError("Invalid Tiff. Missing tags");
    }

    return { height, width };
  },
};
