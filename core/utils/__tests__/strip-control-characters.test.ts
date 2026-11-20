import { describe, expect, it } from "vitest";

import { stripControlCharacters } from "../strip-control-characters";

describe("stripControlCharacters", () => {
  it("removes U+0000 to U+001F and U+007F", () => {
    const controls = Array.from({ length: 0x20 }, (_, code) => String.fromCharCode(code)).join("");

    expect(stripControlCharacters(`a${controls}b\u007Fc`)).toBe("abc");
  });

  it("keeps spaces, letters, symbols, emoji and the characters just outside the ranges", () => {
    const text = "Zoë O'Brien 日本 🙂  \u0080 é";

    expect(stripControlCharacters(text)).toBe(text);
  });

  it("returns an empty string for nothing but control characters", () => {
    expect(stripControlCharacters("\u0000\n\r\t\u007F")).toBe("");
  });
});
