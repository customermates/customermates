import { deflateSync } from "node:zlib";

const SIZE = 96;
const RADIUS = 22;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index);
  bytes.set(data, 8);
  view.setUint32(8 + data.length, crc32(bytes.subarray(4, 8 + data.length)));
  return bytes;
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)) as [number, number, number];
}

function insideRoundedSquare(x: number, y: number): boolean {
  const cx = Math.min(Math.max(x, RADIUS), SIZE - 1 - RADIUS);
  const cy = Math.min(Math.max(y, RADIUS), SIZE - 1 - RADIUS);
  return (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2;
}

const WAVES = [40, 58] as const;
const WAVE_HALF_WIDTH = 4;
const WAVE_AMPLITUDE = [0, 2, 4, 5, 6, 5, 4, 2, 0, -2, -4, -5, -6, -5, -4, -2] as const;

function onWave(x: number, y: number): boolean {
  if (x < 18 || x > SIZE - 19) return false;
  const lift = WAVE_AMPLITUDE[Math.floor(x / 6) % WAVE_AMPLITUDE.length] ?? 0;
  return WAVES.some((base) => Math.abs(y - (base + lift)) <= WAVE_HALF_WIDTH);
}

export function demoBrandLogoPng(accentColor: string): Uint8Array {
  const [red, green, blue] = rgb(accentColor);
  const rowLength = 1 + SIZE * 4;
  const pixels = new Uint8Array(SIZE * rowLength);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!insideRoundedSquare(x, y)) continue;
      const offset = y * rowLength + 1 + x * 4;
      const white = onWave(x, y);
      pixels[offset] = white ? 255 : red;
      pixels[offset + 1] = white ? 255 : green;
      pixels[offset + 2] = white ? 255 : blue;
      pixels[offset + 3] = 255;
    }
  }
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, SIZE);
  headerView.setUint32(4, SIZE);
  header[8] = 8;
  header[9] = 6;
  const parts = [
    Uint8Array.from(PNG_SIGNATURE),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(pixels, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}
