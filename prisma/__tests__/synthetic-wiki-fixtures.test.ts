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
      expect(pages.length, workspace.slug).toBeGreaterThanOrEqual(4);
      expect(pages.length, workspace.slug).toBeLessThanOrEqual(7);
      expect(new Set(pages.map(({ sortOrder }) => sortOrder)).size).toBe(pages.length);
      for (const { kind, title, whenToUse } of pages) {
        if (kind === "procedure")
          expect(whenToUse, title).toMatch(/^(When|Wenn|Cuando|Quando|Gdy|Kiedy|Wanneer|Als) .{40,}\.$/u);
        else expect(whenToUse, title).toBeNull();
      }
      expect(pages[0].markdown, workspace.slug).toMatch(
        /demo data|Demodaten|datos de demostración|dados de demonstração|dane demonstracyjne|demodata|demogegevens/u,
      );
    }
    expect(new Set(wikis.flatMap(({ pages }) => pages.map(({ id }) => id))).size).toBe(
      wikis.reduce((count, { pages }) => count + pages.length, 0),
    );
  });

  it("passes the real editor and procedure validation with useful leading excerpts", () => {
    for (const { pages } of wikis) {
      for (const { whenToUse, ...page } of pages) {
        const result = WikiPageInputSchema.safeParse({ ...page, whenToUse: whenToUse ?? undefined });
        expect(result.success, page.title).toBe(true);
        expect(page.markdown).toMatch(/^\S.+\n\n## /u);
        expect(wikiExcerpt(page.markdown).length, page.title).toBeGreaterThan(70);
      }
      const guide = pages.find(({ kind }) => kind === "guide");
      expect(new TextEncoder().encode(guide?.markdown ?? "").byteLength).toBeLessThanOrEqual(
        WIKI_GUIDE_CONTEXT_MAX_BYTES,
      );
    }
  });

  it("links the pages of every demo workspace to each other, so its map is one connected picture", () => {
    for (const { workspace, pages } of wikis) {
      const ids = new Set(pages.map(({ id }) => id));
      const linksOf = (markdown: string) =>
        extractWikiPageLinks(markdown, "http://localhost:4000", workspace.slug).map(({ id }) => id);
      const guide = pages[0];
      const inbound = new Map<string, number>();
      const neighbours = new Map<string, Set<string>>(pages.map(({ id }) => [id, new Set<string>()]));
      for (const page of pages) {
        const targets = linksOf(page.markdown);
        if (page !== guide) expect(targets.length, `${workspace.slug}: ${page.title} links nowhere`).toBeGreaterThan(0);
        expect(targets, `${workspace.slug}: ${page.title} links to itself`).not.toContain(page.id);
        for (const target of targets) {
          expect(ids.has(target), `${workspace.slug}: ${page.title} links outside its workspace`).toBe(true);
          inbound.set(target, (inbound.get(target) ?? 0) + 1);
          neighbours.get(page.id)?.add(target);
          neighbours.get(target)?.add(page.id);
        }
        expect(page.markdown, `${workspace.slug}: ${page.title}`).not.toMatch(/\]\((?:wiki|list):/u);
      }
      for (const page of pages.slice(1))
        expect(inbound.get(page.id) ?? 0, `${workspace.slug}: nothing links to ${page.title}`).toBeGreaterThan(0);
      expect(inbound.get(guide.id), `${workspace.slug}: every page links to the guide, the centre of the map`).toBe(
        pages.length - 1,
      );

      const reached = new Set<string>();
      const queue = [guide.id];
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        if (reached.has(id)) continue;
        reached.add(id);
        queue.push(...(neighbours.get(id) ?? []));
      }
      expect(reached, `${workspace.slug}: the map is one connected picture`).toEqual(ids);
    }
  });
});
