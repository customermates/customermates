export const BRAND_LOGO_MAX_BYTES = 512 * 1024;
export const BRAND_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type BrandLogoType = (typeof BRAND_LOGO_TYPES)[number];

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);
}

export function sniffBrandLogoType(bytes: Uint8Array): BrandLogoType | null {
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "image/webp";
  return null;
}

export type BrandLogoRefusal = "tooLarge" | "unsupported";

export function brandLogoRefusal(bytes: Uint8Array): BrandLogoRefusal | null {
  if (bytes.length > BRAND_LOGO_MAX_BYTES) return "tooLarge";
  return sniffBrandLogoType(bytes) ? null : "unsupported";
}
