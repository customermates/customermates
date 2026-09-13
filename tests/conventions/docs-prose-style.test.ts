import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

/**
 * Product documentation is written without em or en dashes, because the house voice uses
 * commas, colons and full stops instead. Scoped to content/docs deliberately: the marketing
 * corpus under content/blog-posts, content/feature-pages and content/for-pages uses them
 * freely, and a repo-wide rule would fire on all of it.
 *
 * Code is exempt. A fenced block or an inline span may legitimately contain a dash, and a
 * table's own --- separator row is punctuation, not prose.
 *
 * An em dash is always prose. An en dash is only prose when it stands alone between spaces:
 * between digits it is a numeric range, which is ordinary typography and stays allowed.
 */
const PROSE_DASH = /—|(?<!\d)\s–|–\s(?!\d)/;

function prose(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, "");
}

function docFiles() {
  return walkFiles(join(REPO_ROOT, "content", "docs"), (path) => path.endsWith(".mdx"));
}

export function dashViolations(sources: { file: string; text: string }[]) {
  const found: string[] = [];

  for (const { file, text } of sources)
    prose(text)
      .split("\n")
      .forEach((line, index) => {
        if (PROSE_DASH.test(line)) found.push(`${file}:${index + 1}: ${line.trim().slice(0, 120)}`);
      });

  return found;
}

describe("documentation prose style", () => {
  it("writes documentation without em or en dashes", () => {
    const violations = dashViolations(
      docFiles().map((file) => ({ file: relative(REPO_ROOT, file), text: readFileSync(file, "utf8") })),
    );

    expect(violations, `Rewrite these with a comma, a colon or a full stop:\n${violations.join("\n")}`).toEqual([]);
  });

  it("still reads the corpus it is meant to guard", () => {
    expect(docFiles().length).toBeGreaterThan(20);
  });

  it("looks at prose only, never at code", () => {
    expect(dashViolations([{ file: "bad.mdx", text: "A routine — a saved instruction." }])).toHaveLength(1);
    expect(dashViolations([{ file: "prose-en.mdx", text: "A routine – a saved instruction." }])).toHaveLength(1);
    expect(dashViolations([{ file: "range.mdx", text: "Membership takes 1–50 UUIDs." }])).toHaveLength(0);
    expect(dashViolations([{ file: "fenced.mdx", text: "```\nconst a = 1; // an em dash —\n```" }])).toHaveLength(0);
    expect(dashViolations([{ file: "inline.mdx", text: "Set `--flag —value` on the command." }])).toHaveLength(0);
  });
});
