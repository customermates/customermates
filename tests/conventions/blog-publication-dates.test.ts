import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";

import { REPO_ROOT, walkFiles } from "./walk";

const POSTS = walkFiles(join(REPO_ROOT, "content", "blog-posts"), (path) => path.endsWith(".mdx"));
const CALENDAR_DATE = z.iso.date();

function blogPostDates(source: string): { date?: unknown; updated?: unknown } {
  const frontmatter = /^---\n(.*?)\n---\n?/su.exec(source);
  return frontmatter ? ((parse(frontmatter[1]) as { blogPost?: { date?: unknown; updated?: unknown } }).blogPost ?? {}) : {};
}

function publicationDate(source: string): unknown {
  return blogPostDates(source).date;
}

describe("blog publication dates", () => {
  it("reads every blog post", () => {
    expect(POSTS.length).toBeGreaterThan(80);
  });

  it("writes every publication date as a real calendar date", () => {
    // The MDX loader's YAML turns an unquoted 2026-02-30 into 2 March, so the frontmatter schema receives a
    // valid Date. This parser keeps timestamps as text, which still shows the typo.
    const invalid = POSTS.map((file) => ({
      file: relative(REPO_ROOT, file),
      date: publicationDate(readFileSync(file, "utf8")),
    }))
      .filter(({ date }) => typeof date !== "string" || !CALENDAR_DATE.safeParse(date).success)
      .map(({ file, date }) => `${file}: ${String(date ?? "missing")}`);

    expect(invalid).toEqual([]);
  });

  it("writes every update date as a real calendar date on or after publication", () => {
    const invalid = POSTS.map((file) => ({ file: relative(REPO_ROOT, file), ...blogPostDates(readFileSync(file, "utf8")) }))
      .filter(({ updated }) => updated !== undefined)
      .filter(
        ({ date, updated }) =>
          typeof updated !== "string" || !CALENDAR_DATE.safeParse(updated).success || String(updated) < String(date),
      )
      .map(({ file, updated }) => `${file}: ${String(updated)}`);

    expect(invalid).toEqual([]);
  });
});
