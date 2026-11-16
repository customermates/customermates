import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { PRODUCT_FILMS, PRODUCT_FILM_PUBLIC_PATHS, productFilmFor } from "@/components/marketing/product-film-assets";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

const PUBLIC = join(REPO_ROOT, "public");

function jpegSize(path: string): { height: number; width: number } {
  const bytes = readFileSync(path);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error(`${path} is not a baseline JPEG`);
    const marker = bytes[offset + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  throw new Error(`${path} has no frame header`);
}

const ENGLISH_WORD = { de: /englisch/iu, es: /ingl[eé]s/iu, fr: /anglais/iu, it: /inglese/iu } as const;
const OWN_FILM_LOCALES = Object.keys(ENGLISH_WORD) as (keyof typeof ENGLISH_WORD)[];

describe("product film per locale", () => {
  it("shows the film of a locale on its pages and the English film on the others", () => {
    expect(productFilmFor("en")).toBe(PRODUCT_FILMS.en);
    for (const locale of OWN_FILM_LOCALES) expect(productFilmFor(locale), locale).toBe(PRODUCT_FILMS[locale]);
    for (const locale of CONTENT_LOCALES.filter((value) => value !== "en" && !OWN_FILM_LOCALES.some((own) => own === value))) {
      expect(productFilmFor(locale), locale).toBe(PRODUCT_FILMS.en);
    }
    expect(productFilmFor("xx")).toBe(PRODUCT_FILMS.en);
  });

  it("ships every film and poster, the posters at the size the poster image props declare", () => {
    for (const path of PRODUCT_FILM_PUBLIC_PATHS) {
      const file = join(PUBLIC, path);
      expect(existsSync(file), path).toBe(true);
      expect(statSync(file).size, path).toBeGreaterThan(50_000);
    }
    for (const film of Object.values(PRODUCT_FILMS)) {
      expect(statSync(join(PUBLIC, film.src)).size, film.src).toBeLessThan(25_000_000);
      for (const poster of Object.values(film.posters)) expect(jpegSize(join(PUBLIC, poster)), poster).toEqual({ height: 1620, width: 2880 });
    }
    expect(new Set(PRODUCT_FILM_PUBLIC_PATHS).size).toBe(PRODUCT_FILM_PUBLIC_PATHS.length);
  });

  it("gives every film and poster the cache headers of next.config.ts", () => {
    const config = readFileSync(join(REPO_ROOT, "next.config.ts"), "utf8");
    for (const path of PRODUCT_FILM_PUBLIC_PATHS) expect(config, path).toContain(`"${path}"`);
  });

  it("names the length of the film each locale shows in the hero's film button", () => {
    for (const locale of CONTENT_LOCALES) {
      const homepage = readFileSync(join(REPO_ROOT, "content", "homepage", locale, "homepage.mdx"), "utf8");
      expect(homepage, locale).toContain(`(${productFilmFor(locale).seconds} s)`);
    }
  });

  it("does not call a locale's own film English in its caption", () => {
    for (const locale of OWN_FILM_LOCALES) {
      const messages = JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", `${locale}.json`), "utf8")) as {
        ProductFilm: { caption: string };
      };
      expect(messages.ProductFilm.caption, locale).not.toMatch(ENGLISH_WORD[locale]);
    }
  });
});
