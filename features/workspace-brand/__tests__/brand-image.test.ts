import { describe, expect, it } from "vitest";

import { BRAND_LOGO_MAX_BYTES, brandLogoRefusal, sniffBrandLogoType } from "../brand-image";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20];
const WAVE = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const text = (value: string) => new TextEncoder().encode(value);

describe("sniffBrandLogoType", () => {
  it("recognises PNG, JPEG and WebP by their first bytes", () => {
    expect(sniffBrandLogoType(Uint8Array.from(PNG))).toBe("image/png");
    expect(sniffBrandLogoType(Uint8Array.from(JPEG))).toBe("image/jpeg");
    expect(sniffBrandLogoType(Uint8Array.from(WEBP))).toBe("image/webp");
  });

  it("refuses SVG, GIF, HTML, other RIFF files and truncated or empty input", () => {
    expect(sniffBrandLogoType(text('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'))).toBeNull();
    expect(sniffBrandLogoType(text('<?xml version="1.0"?><svg></svg>'))).toBeNull();
    expect(sniffBrandLogoType(text("<!doctype html><html></html>"))).toBeNull();
    expect(sniffBrandLogoType(Uint8Array.from(GIF))).toBeNull();
    expect(sniffBrandLogoType(Uint8Array.from(WAVE))).toBeNull();
    expect(sniffBrandLogoType(Uint8Array.from(PNG.slice(0, 5)))).toBeNull();
    expect(sniffBrandLogoType(Uint8Array.from(WEBP.slice(0, 10)))).toBeNull();
    expect(sniffBrandLogoType(new Uint8Array())).toBeNull();
  });
});

describe("brandLogoRefusal", () => {
  it("accepts an image of exactly the largest size and refuses one byte more", () => {
    const largest = new Uint8Array(BRAND_LOGO_MAX_BYTES);
    largest.set(PNG);
    const tooLarge = new Uint8Array(BRAND_LOGO_MAX_BYTES + 1);
    tooLarge.set(PNG);

    expect(brandLogoRefusal(largest)).toBeNull();
    expect(brandLogoRefusal(tooLarge)).toBe("tooLarge");
  });

  it("refuses a file that is not one of the three image types", () => {
    expect(brandLogoRefusal(text("<svg></svg>"))).toBe("unsupported");
  });
});
