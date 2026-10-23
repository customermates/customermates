import { describe, expect, it } from "vitest";

import { wikiExcerpt } from "@/features/wiki/wiki-content";
import { extractWikiPageLinks } from "@/features/wiki/wiki-markdown-links";
import { WIKI_GUIDE_CONTEXT_MAX_BYTES, WikiPageInputSchema } from "@/features/wiki/wiki.schema";

import { solutionWorkspacePlan } from "../seeds/solutions/seed-solutions";
import { buildSolutionWiki } from "../seeds/solutions/solution-presentation";
import { SOLUTION_WORKSPACES } from "../seeds/solutions/solution-workspaces";

const wikis = SOLUTION_WORKSPACES.map((workspace) => {
  const { content } = solutionWorkspacePlan(workspace);
  return { workspace, pages: buildSolutionWiki(workspace, content) };
});

describe("demo Knowledge Base fixtures", () => {
  it("gives every demo workspace one Operating Guide first and a few pages in its data language", () => {
    for (const { workspace, pages } of wikis) {
      expect(pages[0], workspace.slug).toMatchObject({ kind: "guide", sortOrder: -1 });
      expect(
        pages.filter(({ kind }) => kind === "guide"),
        workspace.slug,
      ).toHaveLength(1);
      expect(pages.length, workspace.slug).toBeGreaterThanOrEqual(2);
      expect(pages.length, workspace.slug).toBeLessThanOrEqual(4);
      expect(new Set(pages.map(({ sortOrder }) => sortOrder)).size).toBe(pages.length);
      for (const { kind, title, whenToUse } of pages) {
        if (kind === "procedure") expect(whenToUse, title).toMatch(/^(When|Wenn) .{40,}\.$/u);
        else expect(whenToUse, title).toBeNull();
      }
      expect(pages[0].markdown, workspace.slug).toMatch(/demo data|Demodaten/u);
    }
    expect(new Set(wikis.flatMap(({ pages }) => pages.map(({ id }) => id))).size).toBe(
      wikis.reduce((count, { pages }) => count + pages.length, 0),
    );
  });

  it("passes the real editor and procedure validation with useful leading excerpts", () => {
    for (const { workspace, pages } of wikis) {
      for (const { whenToUse, ...page } of pages) {
        const result = WikiPageInputSchema.safeParse({ ...page, whenToUse: whenToUse ?? undefined });
        expect(result.success, page.title).toBe(true);
        expect(page.markdown).toMatch(/^\S.+\n\n## /u);
        expect(wikiExcerpt(page.markdown).length, page.title).toBeGreaterThan(70);
        expect(extractWikiPageLinks(page.markdown, "http://localhost:4000", workspace.slug), page.title).toEqual([]);
      }
      const guide = pages.find(({ kind }) => kind === "guide");
      expect(new TextEncoder().encode(guide?.markdown ?? "").byteLength).toBeLessThanOrEqual(
        WIKI_GUIDE_CONTEXT_MAX_BYTES,
      );
    }
  });
});
