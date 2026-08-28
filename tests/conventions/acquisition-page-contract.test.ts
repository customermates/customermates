import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { ACQUISITION_FACT_SOURCES, acquisitionPageSchema } from "@/core/fumadocs/schemas/common";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

const APPROVED_PAIRS = [
  ["feature-pages", "self-hosted"],
  ["feature-pages", "unified-inbox"],
  ["for-pages", "agencies"],
  ["for-pages", "professional-services"],
  ["blog-posts", "agentic-crm"],
  ["blog-posts", "open-source-crm"],
] as const;

type Frontmatter = {
  acquisition?: unknown;
  cta?: { buttonLeftHref?: string; buttonRightHref?: string };
  description?: string;
  hero?: {
    buttonLeftHref?: string;
    buttonRightHref?: string;
    description?: string;
    showOpenSourceBadge?: boolean;
    title?: string;
  };
  title?: string;
};

function contentFile(collection: string, locale: string, slug: string) {
  return join(REPO_ROOT, "content", collection, locale, `${slug}.mdx`);
}

function readPage(path: string): { body: string; data: Frontmatter } {
  const source = readFileSync(path, "utf8");
  const frontmatter = /^---\n(.*?)\n---\n?/su.exec(source);
  if (!frontmatter) throw new Error(`${path} has no frontmatter`);
  return {
    body: source.slice(frontmatter[0].length),
    data: parse(frontmatter[1]) as Frontmatter,
  };
}

describe("approved acquisition page contract", () => {
  it("binds all six approved bilingual page pairs to rendered page inputs", () => {
    const problems: string[] = [];
    let count = 0;

    for (const [collection, slug] of APPROVED_PAIRS) {
      for (const locale of CONTENT_LOCALES) {
        const path = contentFile(collection, locale, slug);
        if (!existsSync(path)) {
          problems.push(`${path} is missing`);
          continue;
        }

        count += 1;
        const { body, data } = readPage(path);
        const parsed = acquisitionPageSchema.safeParse(data.acquisition);
        if (!parsed.success) {
          problems.push(`${path}: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
          continue;
        }

        const contract = parsed.data;
        if (contract.locale !== locale) problems.push(`${path}: locale is ${contract.locale}`);
        if (contract.slug !== slug) problems.push(`${path}: slug is ${contract.slug}`);
        if (contract.metadata.title !== data.title) problems.push(`${path}: acquisition title drifted`);
        if (contract.metadata.description !== data.description)
          problems.push(`${path}: acquisition description drifted`);
        if (contract.visual.locale !== locale) problems.push(`${path}: visual locale is ${contract.visual.locale}`);
        if (contract.visual.source.headline !== data.hero?.title) problems.push(`${path}: visual headline drifted`);
        if (contract.visual.source.body !== data.hero?.description) problems.push(`${path}: visual body drifted`);
        if (!body.includes("<Faq>")) problems.push(`${path}: FAQPage is declared without rendered FAQ content`);

        const expectedTypes =
          collection === "blog-posts" ? ["Article", "BreadcrumbList", "FAQPage"] : ["BreadcrumbList", "FAQPage"];
        if (JSON.stringify(contract.structuredData.types) !== JSON.stringify(expectedTypes)) {
          problems.push(`${path}: structured-data declaration does not match its route`);
        }

        const primary = data.hero?.buttonLeftHref ?? data.cta?.buttonLeftHref;
        const secondary = data.hero?.buttonRightHref ?? data.cta?.buttonRightHref;
        if (primary) {
          if (contract.cta.primaryHref !== primary) problems.push(`${path}: primary CTA drifted`);
          if (contract.cta.secondaryHref !== secondary) problems.push(`${path}: secondary CTA drifted`);
        } else {
          if (!body.includes(`](${contract.cta.primaryHref})`)) problems.push(`${path}: primary CTA is not rendered`);
          if (!body.includes(`](${contract.cta.secondaryHref})`))
            problems.push(`${path}: secondary CTA is not rendered`);
        }

        if (contract.visual.kind !== "brand-illustration")
          problems.push(`${path}: visual is not an authored illustration`);
        if (contract.visual.referenceSystemVersion !== "customermates-marketing-visuals@8")
          problems.push(`${path}: visual system version drifted`);
        if (contract.visual.kind === "brand-illustration") {
          if (contract.visual.selection !== "automatic") problems.push(`${path}: visual selection is not automatic`);
          if (JSON.stringify(contract.visual.placements) !== JSON.stringify(["wide", "split", "narrow"]))
            problems.push(`${path}: visual placements drifted`);
        }

        for (const fact of contract.proof.factReferences) {
          const sources = ACQUISITION_FACT_SOURCES[fact];
          for (const source of sources) {
            if (!existsSync(join(REPO_ROOT, source))) problems.push(`${path}: ${fact} source ${source} is missing`);
          }
        }
      }
    }

    expect(count).toBe(12);
    expect(problems).toEqual([]);
  });

  it("renders validated acquisition illustrations without legacy slug PNGs", () => {
    for (const route of [
      "app/[locale]/(static)/blog/[slug]/page.tsx",
      "app/[locale]/(static)/features/[slug]/page.tsx",
      "app/[locale]/(static)/for/[industry]/page.tsx",
    ]) {
      const source = readFileSync(join(REPO_ROOT, route), "utf8");
      expect(source, route).toContain('page.data.acquisition?.visual.kind === "brand-illustration"');
      expect(source, route).toContain("<AcquisitionStoryVisual");
      expect(source, route).not.toContain("<ShowcaseFrame");
      expect(source, route).not.toMatch(/src=\{`\$\{(?:slug|industry)\}\.png`\}/u);
    }

    const visual = readFileSync(join(REPO_ROOT, "components/marketing/acquisition-story-visual.tsx"), "utf8");
    for (const focalForm of ["context-card", "provider-set", "kanban-board", "draft"])
      expect(visual).toContain(`case "${focalForm}"`);
  });

  it("keeps acquisition cards free of stale hero art", () => {
    for (const route of [
      "app/[locale]/(static)/features/all/page.tsx",
      "app/[locale]/(static)/for/page.tsx",
      "components/marketing/related-pages.tsx",
    ]) {
      const source = readFileSync(join(REPO_ROOT, route), "utf8");
      expect(source, route).toMatch(/data\.acquisition \? undefined : `\$\{slug\}\.png`/u);
    }

    for (const route of ["app/[locale]/(static)/blog/page.tsx", "app/[locale]/(static)/blog/[slug]/page.tsx"]) {
      const source = readFileSync(join(REPO_ROOT, route), "utf8");
      expect(source, route).toContain("showImage={!post.data.acquisition}");
    }

    const blogCard = readFileSync(join(REPO_ROOT, "app/[locale]/(static)/blog/blog-post-card.tsx"), "utf8");
    expect(blogCard).toContain("showImage = true");
    expect(blogCard).toContain("placeholderLabel={imagePath ? undefined : title}");
  });

  it("does not label the cloud-only unified inbox as AGPL open source", () => {
    for (const locale of CONTENT_LOCALES) {
      const { data } = readPage(contentFile("feature-pages", locale, "unified-inbox"));
      expect(data.hero?.showOpenSourceBadge, locale).toBe(false);
    }

    const source = readFileSync(join(REPO_ROOT, "components/marketing/page-hero.tsx"), "utf8");
    expect(source).toContain("showOpenSourceBadge = true");
    expect(source).toContain("showOpenSourceBadge ? <AgplGithubBadge /> : null");
  });

  it("binds deal-pipeline proof to configurable stages and the rendered Kanban board", () => {
    const sources = ACQUISITION_FACT_SOURCES["product:deal-pipelines"];
    expect(sources).toContain("features/mcp-tools/server-instructions.ts");
    expect(sources).toContain("components/data-view/data-kanban-view.tsx");

    expect(readFileSync(join(REPO_ROOT, "features/mcp-tools/server-instructions.ts"), "utf8")).toContain(
      "Deal stage and task status are singleSelect custom columns",
    );
    expect(readFileSync(join(REPO_ROOT, "components/data-view/data-kanban-view.tsx"), "utf8")).toContain(
      'data-slot="kanban-root"',
    );
  });

  it("binds hosted Mate proof to availability, enforced approvals, and credit entitlements", () => {
    const sources = ACQUISITION_FACT_SOURCES["product:hosted-mate-capability"];
    expect(sources).toContain("ee/agent-chat/agent-availability.ts");
    expect(sources).toContain("ee/agent-chat/gated-tools.ts");
    expect(sources).toContain("core/commercial/plan-catalog.ts");
    expect(sources).toContain("ee/subscription/entitlements.ts");
  });

  it("keeps each locale pair on one cluster, role, proof boundary, and schema shape", () => {
    const problems: string[] = [];

    for (const [collection, slug] of APPROVED_PAIRS) {
      const pages = CONTENT_LOCALES.map((locale) => {
        const { data } = readPage(contentFile(collection, locale, slug));
        return acquisitionPageSchema.parse(data.acquisition);
      });
      const [en, de] = pages;
      for (const key of ["clusterId", "role"] as const) {
        if (en[key] !== de[key]) problems.push(`${collection}/${basename(slug)}: ${key} differs by locale`);
      }
      if (JSON.stringify(en.proof) !== JSON.stringify(de.proof)) {
        problems.push(`${collection}/${basename(slug)}: proof boundary differs by locale`);
      }
      if (JSON.stringify(en.structuredData) !== JSON.stringify(de.structuredData)) {
        problems.push(`${collection}/${basename(slug)}: structured data differs by locale`);
      }
    }

    expect(problems).toEqual([]);
  });
});
