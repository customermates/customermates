import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

// Every marketing page is prerendered and served from the edge cache. One request-bound read in any
// segment above a page turns the whole route dynamic again, and the response goes back to
// `private, no-store`: the root layout used to read the theme cookie, the marketing layout
// resolved the visitor's session, and the hubs read `?page=`. None of that fails a build.

const STATIC_ROOT = join(REPO_ROOT, "app", "[locale]", "(static)");
const DOCUMENT_SEGMENTS = [
  join(REPO_ROOT, "app", "layout.tsx"),
  join(REPO_ROOT, "app", "root-document.tsx"),
  join(REPO_ROOT, "app", "providers.tsx"),
  join(REPO_ROOT, "app", "not-found.tsx"),
  join(REPO_ROOT, "app", "[locale]", "layout.tsx"),
  join(REPO_ROOT, "app", "[locale]", "not-found.tsx"),
];
const REQUEST_BOUND = [
  /\bcookies\(\)/u,
  /\bheaders\(\)/u,
  /\bsearchParams\b/u,
  /\bconnection\(\)/u,
  /\bresolveRequestAccountState\b/u,
  /\buseSearchParams\b/u,
  /export const dynamic = "force-dynamic"/u,
];

function staticSegments(): string[] {
  return walkFiles(STATIC_ROOT, (path) => /[/\\](page|layout)\.tsx$/u.test(path)).filter(
    (path) => !path.split(sep).includes("__tests__"),
  );
}

describe("static marketing rendering", () => {
  it("finds the marketing routes it polices", () => {
    expect(staticSegments().length).toBeGreaterThan(25);
  });

  it("sets the request locale from the URL in every marketing page, so next-intl never reads a header", () => {
    const missing = staticSegments()
      .filter((path) => path.endsWith("page.tsx") || path === join(STATIC_ROOT, "layout.tsx"))
      .filter((path) => !readFileSync(path, "utf8").includes("enableStaticLocale(params)"))
      .map((path) => relative(REPO_ROOT, path));

    expect(missing).toEqual([]);
  });

  it("keeps request-bound reads out of the document and every marketing segment", () => {
    const problems = [...DOCUMENT_SEGMENTS, ...staticSegments()].flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return REQUEST_BOUND.filter((pattern) => pattern.test(source)).map(
        (pattern) => `${relative(REPO_ROOT, path)} uses ${pattern.source}`,
      );
    });

    expect(problems).toEqual([]);
  });

  it("keeps the root not-found boundary locale-explicit, because Next renders it into every page", () => {
    const source = readFileSync(join(REPO_ROOT, "app", "not-found.tsx"), "utf8");

    expect(source).not.toMatch(/\bgetLocale\(/u);
    expect(source).not.toMatch(/\bgetMessages\(\)/u);
    expect(source).not.toMatch(/\bgetTranslations\(\)/u);
  });

  it("revalidates marketing pages instead of rendering them per request", () => {
    expect(readFileSync(join(STATIC_ROOT, "layout.tsx"), "utf8")).toMatch(/export const revalidate = \d+;/u);
  });
});
