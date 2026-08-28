import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const APPROVED_PAGES = [
  "content/feature-pages/en/self-hosted.mdx",
  "content/feature-pages/de/self-hosted.mdx",
  "content/feature-pages/en/unified-inbox.mdx",
  "content/feature-pages/de/unified-inbox.mdx",
  "content/for-pages/en/professional-services.mdx",
  "content/for-pages/de/professional-services.mdx",
  "content/for-pages/en/agencies.mdx",
  "content/for-pages/de/agencies.mdx",
  "content/blog-posts/en/agentic-crm.mdx",
  "content/blog-posts/de/agentic-crm.mdx",
  "content/blog-posts/en/open-source-crm.mdx",
  "content/blog-posts/de/open-source-crm.mdx",
] as const;

function source(path: string) {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("acquisition MDX component system", () => {
  it("renders answer-first summaries, proof rails, workflows and decision boundaries in both locales", () => {
    for (const page of APPROVED_PAGES) {
      const content = source(page);

      expect(content, page).toContain("<ArticleSummary");
      expect(content, page).toContain("<SummaryItem");
      expect(content, page).toContain("<ProofRail");
      expect(content, page).toContain("<ProofItem");
      expect(content, page).toContain("<Steps>");
      expect(content, page).toContain("<Step ");
    }
  });

  it("registers semantic server-rendered article primitives", () => {
    const registry = source("core/fumadocs/mdx-components.tsx");
    const blocks = source("components/marketing/article-blocks.tsx");

    for (const component of [
      "AcquisitionCallout",
      "ArticleSummary",
      "ProofItem",
      "ProofRail",
      "SummaryItem",
    ]) {
      expect(registry).toContain(component);
    }

    expect(blocks).not.toContain('"use client"');
    expect(blocks).toContain("<section");
    expect(blocks).toContain("<dl");
    expect(blocks).toContain("<dt");
    expect(blocks).toContain("<dd");
    expect(blocks).toContain("<aside");
    expect(blocks).toContain('role="note"');
  });
});
