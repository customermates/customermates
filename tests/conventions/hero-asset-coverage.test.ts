import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
} from "node:fs";
import { extname, join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { REPO_ROOT } from "./walk";

import { LANDING_HUBS } from "@/core/seo/landing-hubs";
import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

const IMAGE_THEMES = ["light", "dark"] as const;
const HERO_WIDTH = 1920;
const HERO_HEIGHT = 1080;
const PNG_HEADER_BYTES = 24;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IHDR_SIGNATURE = [0x49, 0x48, 0x44, 0x52];

type Dimensions = { height: number; width: number };

function startsWith(
  header: Uint8Array,
  signature: number[],
  offset: number,
): boolean {
  return signature.every((byte, index) => header[offset + index] === byte);
}

export function pngDimensions(header: Uint8Array): Dimensions | null {
  if (header.length < PNG_HEADER_BYTES) return null;
  if (!startsWith(header, PNG_SIGNATURE, 0)) return null;
  if (!startsWith(header, IHDR_SIGNATURE, 12)) return null;

  const view = new DataView(
    header.buffer,
    header.byteOffset,
    header.byteLength,
  );
  return { height: view.getUint32(20), width: view.getUint32(16) };
}

function readPngHeader(path: string): Uint8Array {
  const header = new Uint8Array(PNG_HEADER_BYTES);
  const handle = openSync(path, "r");

  try {
    const read = readSync(handle, header, 0, PNG_HEADER_BYTES, 0);
    return header.subarray(0, read);
  } finally {
    closeSync(handle);
  }
}

function collectionSlugs(collection: string): string[] {
  const directory = join(REPO_ROOT, "content", collection, DEFAULT_LOCALE);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".mdx")
    .map((entry) => entry.name.slice(0, -".mdx".length))
    .sort();
}

function imageSlugs(theme: string, locale: string): string[] {
  const directory = join(REPO_ROOT, "public", "images", theme, locale);
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".png")
    .map((entry) => entry.name.slice(0, -".png".length))
    .sort();
}

function pageUsesHeroAsset(collection: string, locale: string, slug: string): boolean {
  const path = join(REPO_ROOT, "content", collection, locale, `${slug}.mdx`);
  const source = readFileSync(path, "utf8");
  const frontmatter = /^---\n(.*?)\n---\n?/su.exec(source);
  if (!frontmatter) return true;

  const data = parse(frontmatter[1]) as { acquisition?: { visual?: { kind?: string } } };
  return data.acquisition?.visual?.kind !== "none";
}

describe("hero asset coverage", () => {
  const slugsByCollection = new Map(
    LANDING_HUBS.map(({ collection }) => [
      collection,
      collectionSlugs(collection),
    ]),
  );
  const expectedSlugs = new Set([...slugsByCollection.values()].flat());

  it("keeps every landing slug unique in the shared image namespace", () => {
    const owners = new Map<string, string[]>();

    for (const [collection, slugs] of slugsByCollection) {
      expect(
        slugs.length,
        `content/${collection}/${DEFAULT_LOCALE} holds no page`,
      ).toBeGreaterThan(0);
      for (const slug of slugs)
        owners.set(slug, [...(owners.get(slug) ?? []), collection]);
    }

    const collisions = [...owners]
      .filter(([, collections]) => collections.length > 1)
      .map(([slug, collections]) => `${slug}: ${collections.join(", ")}`);

    expect(
      collisions,
      `landing slugs sharing one hero filename:\n${collisions.join("\n")}`,
    ).toEqual([]);
  });

  it("gives every landing slug every localized theme asset", () => {
    const problems: string[] = [];

    for (const [collection, slugs] of slugsByCollection) {
      for (const slug of slugs) {
        for (const theme of IMAGE_THEMES) {
          for (const locale of CONTENT_LOCALES) {
            if (!pageUsesHeroAsset(collection, locale, slug)) continue;
            const relativePath = join(
              "public",
              "images",
              theme,
              locale,
              `${slug}.png`,
            );
            if (!existsSync(join(REPO_ROOT, relativePath)))
              problems.push(`${relativePath} is missing`);
          }
        }
      }
    }

    expect(
      problems,
      `landing pages without a hero asset:\n${problems.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps every localized PNG bound to one landing page", () => {
    const problems: string[] = [];

    for (const theme of IMAGE_THEMES) {
      for (const locale of CONTENT_LOCALES) {
        for (const slug of imageSlugs(theme, locale)) {
          if (!expectedSlugs.has(slug)) {
            problems.push(
              `${join("public", "images", theme, locale, `${slug}.png`)} has no landing page`,
            );
          }
        }
      }
    }

    expect(
      problems,
      `hero assets without a landing page:\n${problems.join("\n")}`,
    ).toEqual([]);
  });

  it(`keeps every hero PNG at ${HERO_WIDTH}x${HERO_HEIGHT}`, () => {
    const problems: string[] = [];

    for (const theme of IMAGE_THEMES) {
      for (const locale of CONTENT_LOCALES) {
        for (const slug of imageSlugs(theme, locale)) {
          const relativePath = join(
            "public",
            "images",
            theme,
            locale,
            `${slug}.png`,
          );
          const dimensions = pngDimensions(
            readPngHeader(join(REPO_ROOT, relativePath)),
          );

          if (!dimensions)
            problems.push(
              `${relativePath} does not start with a PNG IHDR header`,
            );
          else if (
            dimensions.width !== HERO_WIDTH ||
            dimensions.height !== HERO_HEIGHT
          ) {
            problems.push(
              `${relativePath} is ${dimensions.width}x${dimensions.height}`,
            );
          }
        }
      }
    }

    expect(
      problems,
      `hero assets off the required geometry:\n${problems.join("\n")}`,
    ).toEqual([]);
  });

  it("reads and rejects synthetic PNG headers without decoding image bodies", () => {
    const header = new Uint8Array(PNG_HEADER_BYTES);
    header.set(PNG_SIGNATURE, 0);
    header.set(IHDR_SIGNATURE, 12);
    const view = new DataView(header.buffer);
    view.setUint32(16, HERO_WIDTH);
    view.setUint32(20, HERO_HEIGHT);

    expect(pngDimensions(header)).toEqual({
      height: HERO_HEIGHT,
      width: HERO_WIDTH,
    });
    view.setUint32(16, 1280);
    expect(pngDimensions(header)).toEqual({ height: HERO_HEIGHT, width: 1280 });
    expect(pngDimensions(header.subarray(0, 20))).toBeNull();
    expect(pngDimensions(new Uint8Array(PNG_HEADER_BYTES))).toBeNull();
  });
});
