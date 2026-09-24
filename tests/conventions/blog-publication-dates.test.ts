import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { REPO_ROOT, walkFiles } from "./walk";

const POSTS = walkFiles(join(REPO_ROOT, "content", "blog-posts"), (path) => path.endsWith(".mdx"));
const CALENDAR_DATE = z.iso.date();

function publicationDate(source: string): string | undefined {
  const frontmatter = /^---\n([\s\S]*?)\n---/u.exec(source)?.[1] ?? "";
  return /^ {2}date:\s*["']?([^"'\n]*?)["']?\s*$/mu.exec(frontmatter)?.[1];
}

describe("blog publication dates", () => {
  it("reads every blog post", () => {
    expect(POSTS.length).toBeGreaterThan(100);
  });

  it("writes every publication date as a real calendar date", () => {
    // YAML turns an unquoted 2026-02-30 into 2 March, so the frontmatter schema receives a valid Date
    // and only the raw text still shows the typo. The schema catches every other malformed date at build.
    const invalid = POSTS.map((file) => ({
      file: relative(REPO_ROOT, file),
      date: publicationDate(readFileSync(file, "utf8")),
    }))
      .filter(({ date }) => date === undefined || !CALENDAR_DATE.safeParse(date).success)
      .map(({ file, date }) => `${file}: ${date ?? "missing"}`);

    expect(invalid).toEqual([]);
  });
});
