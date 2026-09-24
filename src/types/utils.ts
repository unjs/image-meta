const decoder = new TextDecoder();
export const toUTF8String = (
  input: Uint8Array,
  start = 0,
  end = input.length,
) => decoder.decode(input.slice(start, end));

export const toHexString = (input: Uint8Array, start = 0, end = input.length) =>
  input
    .slice(start, end)
    .reduce((memo, i) => memo + ("0" + i.toString(16)).slice(-2), "");

// Signed readers use arithmetic (not bitwise ops), so reading past the end yields NaN instead of 0
export const readInt16LE = (input: Uint8Array, offset = 0) => {
  const val = input[offset] + input[offset + 1] * 2 ** 8;
  return val >= 2 ** 15 ? val - 2 ** 16 : val;
};

export const readUInt16BE = (input: Uint8Array, offset = 0) =>
  input[offset] * 2 ** 8 + input[offset + 1];

export const readUInt16LE = (input: Uint8Array, offset = 0) =>
  input[offset] + input[offset + 1] * 2 ** 8;

export const readUInt24LE = (input: Uint8Array, offset = 0) =>
  input[offset] + input[offset + 1] * 2 ** 8 + input[offset + 2] * 2 ** 16;

export const readInt32LE = (input: Uint8Array, offset = 0) => {
  const val = readUInt32LE(input, offset);
  return val >= 2 ** 31 ? val - 2 ** 32 : val;
};

export const readUInt32BE = (input: Uint8Array, offset = 0) =>
  input[offset] * 2 ** 24 +
  input[offset + 1] * 2 ** 16 +
  input[offset + 2] * 2 ** 8 +
  input[offset + 3];

export const readUInt32LE = (input: Uint8Array, offset = 0) =>
  input[offset] +
  input[offset + 1] * 2 ** 8 +
  input[offset + 2] * 2 ** 16 +
  input[offset + 3] * 2 ** 24;

// Abstract reading multi-byte unsigned integers
const methods = {
  readUInt16BE,
  readUInt16LE,
  readUInt32BE,
  readUInt32LE,
} as const;

type MethodName = keyof typeof methods;
export function readUInt(
  input: Uint8Array,
  bits: 16 | 32,
  offset: number,
  isBigEndian: boolean,
): number {
  offset = offset || 0;
  const endian = isBigEndian ? "BE" : "LE";
  const methodName: MethodName = ("readUInt" + bits + endian) as MethodName;
  return methods[methodName](input, offset);
}

// Encode a 4-character tag (box type, brand, ...) as the number readUInt32BE reads for it,
// so tags in the input are compared without decoding each one to a string
const encoder = new TextEncoder();
export const toTagCode = (tag: string) => readUInt32BE(encoder.encode(tag));

const BOX_HEADER_SIZE = 8;

// Find an ISO-BMFF box by name, scanning siblings from startOffset up to endOffset
export function findBox(
  input: Uint8Array,
  boxName: string,
  startOffset = 0,
  endOffset = input.length,
) {
  const boxType = toTagCode(boxName);
  let offset = startOffset;
  while (offset + BOX_HEADER_SIZE <= endOffset) {
    const size = readUInt32BE(input, offset);
    // Extended (1) and to-end-of-file (0) sizes are not supported, and smaller sizes are invalid
    if (size < BOX_HEADER_SIZE || offset + size > endOffset) {
      return undefined;
    }
    if (readUInt32BE(input, offset + 4) === boxType) {
      return { offset, size };
    }
    offset += size;
  }
  return undefined;
}
