import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import {
  ACQUISITION_FACT_SOURCES,
  acquisitionPageSchema,
} from "@/core/fumadocs/schemas/common";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { REPO_ROOT } from "./walk";

const APPROVED_PAIRS = [
  ["feature-pages", "cloud-crm"],
  ["feature-pages", "linkedin-integration"],
  ["feature-pages", "self-hosted"],
  ["feature-pages", "unified-inbox"],
  ["for-pages", "agencies"],
  ["for-pages", "professional-services"],
  ["blog-posts", "agentic-crm"],
  ["blog-posts", "open-source-crm"],
] as const;

const PRODUCT_DEMO_PROOF_SLUGS = new Set(["cloud-crm", "linkedin-integration"]);

type Frontmatter = {
  acquisition?: unknown;
  cta?: {
    action?: string;
    buttonLeftHref?: string;
    buttonLeftText?: string;
    buttonRightHref?: string;
    buttonRightText?: string;
    description?: string;
    hint?: string;
  };
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
  it("binds all eight approved bilingual page pairs to rendered page inputs", () => {
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
          problems.push(
            `${path}: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
          );
          continue;
        }

        const contract = parsed.data;
        if (contract.locale !== locale)
          problems.push(`${path}: locale is ${contract.locale}`);
        if (contract.slug !== slug)
          problems.push(`${path}: slug is ${contract.slug}`);
        if (contract.metadata.title !== data.title)
          problems.push(`${path}: acquisition title drifted`);
        if (contract.metadata.description !== data.description)
          problems.push(`${path}: acquisition description drifted`);
        if (contract.visual.locale !== locale)
          problems.push(`${path}: visual locale is ${contract.visual.locale}`);
        if (contract.visual.source.headline !== data.hero?.title)
          problems.push(`${path}: visual headline drifted`);
        if (contract.visual.source.body !== data.hero?.description)
          problems.push(`${path}: visual body drifted`);
        if (!body.includes("<Faq>"))
          problems.push(
            `${path}: FAQPage is declared without rendered FAQ content`,
          );

        const expectedTypes =
          collection === "blog-posts"
            ? ["Article", "BreadcrumbList", "FAQPage"]
            : ["BreadcrumbList", "FAQPage"];
        if (
          JSON.stringify(contract.structuredData.types) !==
          JSON.stringify(expectedTypes)
        ) {
          problems.push(
            `${path}: structured-data declaration does not match its route`,
          );
        }

        if (
          data.hero?.buttonLeftHref &&
          contract.cta.buttonLeftHref !== data.hero.buttonLeftHref
        )
          problems.push(`${path}: primary CTA drifted from the hero`);
        if (
          data.hero?.buttonRightHref &&
          contract.cta.buttonRightHref !== data.hero.buttonRightHref
        )
          problems.push(`${path}: secondary CTA drifted from the hero`);
        if (
          collection !== "blog-posts" &&
          Object.entries(contract.cta).some(
            ([key, value]) =>
              data.cta?.[key as keyof typeof data.cta] !== value,
          )
        )
          problems.push(`${path}: acquisition CTA drifted from the route CTA`);
        if (body.includes("<RelatedPages>") || body.includes("<RelatedPage "))
          problems.push(
            `${path}: related links must be owned by the route ending`,
          );

        const productDemoProof = PRODUCT_DEMO_PROOF_SLUGS.has(slug);
        if (productDemoProof && contract.visual.kind !== "none")
          problems.push(
            `${path}: early product-demo proof must not add a hero illustration`,
          );
        if (!productDemoProof && contract.visual.kind !== "brand-illustration")
          problems.push(`${path}: visual is not an authored illustration`);
        if (
          contract.visual.referenceSystemVersion !==
          "customermates-marketing-visuals@8"
        )
          problems.push(`${path}: visual system version drifted`);
        if (contract.visual.kind === "brand-illustration") {
          if (contract.visual.selection !== "automatic")
            problems.push(`${path}: visual selection is not automatic`);
          if (
            JSON.stringify(contract.visual.placements) !==
            JSON.stringify(["wide", "split", "narrow"])
          )
            problems.push(`${path}: visual placements drifted`);
        }
        if (
          contract.visual.kind === "none" &&
          contract.visual.selection !== "explicit"
        )
          problems.push(`${path}: no-visual decision must be explicit`);

        for (const fact of contract.proof.factReferences) {
          const sources = ACQUISITION_FACT_SOURCES[fact];
          for (const source of sources) {
            if (!existsSync(join(REPO_ROOT, source)))
              problems.push(`${path}: ${fact} source ${source} is missing`);
          }
        }
      }
    }

    expect(count).toBe(16);
    expect(problems).toEqual([]);
  });

  it("renders validated acquisition illustrations without legacy slug PNGs", () => {
    for (const route of [
      "app/[locale]/(static)/features/[slug]/page.tsx",
      "app/[locale]/(static)/for/[industry]/page.tsx",
    ]) {
      const source = readFileSync(join(REPO_ROOT, route), "utf8");
      expect(source, route).toContain(
        'page.data.acquisition?.visual.kind === "brand-illustration"',
      );
      expect(source, route).toContain("<AcquisitionStoryVisual");
      expect(source, route).not.toContain("<ShowcaseFrame");
      expect(source, route).not.toMatch(
        /src=\{`\$\{(?:slug|industry)\}\.png`\}/u,
      );
    }

    const blog = readFileSync(
      join(REPO_ROOT, "app/[locale]/(static)/blog/[slug]/page.tsx"),
      "utf8",
    );
    expect(blog).not.toContain("AcquisitionStoryVisual");
    expect(blog).not.toContain("BlogHeroMedia");
    expect(blog).not.toContain(".png`");

    const visual = readFileSync(
      join(REPO_ROOT, "components/marketing/acquisition-story-visual.tsx"),
      "utf8",
    );
    for (const focalForm of [
      "context-card",
      "provider-set",
      "kanban-board",
      "draft",
    ])
      expect(visual).toContain(`case "${focalForm}"`);
  });

  it("keeps overview, related, and blog surfaces text-only after retiring static hero assets", () => {
    for (const route of [
      "app/[locale]/(static)/features/all/page.tsx",
      "app/[locale]/(static)/for/page.tsx",
      "app/[locale]/(static)/compare/page.tsx",
      "components/marketing/related-pages.tsx",
      "components/marketing/post-card.tsx",
      "app/[locale]/(static)/blog/blog-post-card.tsx",
    ]) {
      const source = readFileSync(join(REPO_ROOT, route), "utf8");
      expect(source, route).not.toContain("imageSrc");
      expect(source, route).not.toContain("placeholderLabel");
      expect(source, route).not.toContain("showImage");
      expect(source, route).not.toContain(".png`");
    }

    expect(
      existsSync(join(REPO_ROOT, "components/marketing/blog-hero-media.tsx")),
    ).toBe(false);
    expect(
      existsSync(join(REPO_ROOT, "components/marketing/hub-post-card.tsx")),
    ).toBe(false);
    expect(
      existsSync(join(REPO_ROOT, "components/marketing/hub-post-grid.tsx")),
    ).toBe(false);

    const schema = readFileSync(join(REPO_ROOT, "core/seo/schemas.ts"), "utf8");
    expect(schema).toContain("image: [ogImage]");
    expect(schema).not.toContain("heroImage");
  });

  it("does not label the cloud-only unified inbox as AGPL open source", () => {
    for (const locale of CONTENT_LOCALES) {
      const { data } = readPage(
        contentFile("feature-pages", locale, "unified-inbox"),
      );
      expect(data.hero?.showOpenSourceBadge, locale).toBe(false);
    }

    const source = readFileSync(
      join(REPO_ROOT, "components/marketing/page-hero.tsx"),
      "utf8",
    );
    expect(source).toContain("showOpenSourceBadge = true");
    expect(source).toContain(
      "showOpenSourceBadge ? <AgplGithubBadge /> : null",
    );
  });

  it("binds the unified-inbox conversation and contact identities in every locale", () => {
    for (const locale of CONTENT_LOCALES) {
      const { data } = readPage(
        contentFile("feature-pages", locale, "unified-inbox"),
      );
      const visual = acquisitionPageSchema.parse(data.acquisition).visual;
      if (visual.kind !== "brand-illustration")
        throw new Error(`${locale}: expected a brand illustration`);

      const conversation = visual.supportingSubjects.find(
        (subject) => subject.id === "conversation-list",
      );
      const contact = visual.supportingSubjects.find(
        (subject) => subject.id === "contact-context",
      );
      expect(conversation, locale).toMatchObject({
        fixtures: {
          conversation: "gmail-rollout-next-steps",
          person: "anna-mueller",
        },
        form: "record",
      });
      expect(contact, locale).toMatchObject({
        fixtures: { person: "anna-mueller" },
      });
    }
  });

  it("binds deal-pipeline proof to configurable stages and the rendered Kanban board", () => {
    const sources = ACQUISITION_FACT_SOURCES["product:deal-pipelines"];
    expect(sources).toContain("features/mcp-tools/server-instructions.ts");
    expect(sources).toContain("components/data-view/data-kanban-view.tsx");

    expect(
      readFileSync(
        join(REPO_ROOT, "features/mcp-tools/server-instructions.ts"),
        "utf8",
      ),
    ).toContain("Deal stage and task status are singleSelect custom columns");
    expect(
      readFileSync(
        join(REPO_ROOT, "components/data-view/data-kanban-view.tsx"),
        "utf8",
      ),
    ).toContain('data-slot="kanban-root"');
  });

  it("binds hosted Mate proof to availability, enforced approvals, and credit entitlements", () => {
    const sources = ACQUISITION_FACT_SOURCES["product:hosted-mate-capability"];
    expect(sources).toContain("ee/agent-chat/agent-availability.ts");
    expect(sources).toContain("ee/agent-chat/gated-tools.ts");
    expect(sources).toContain("core/commercial/plan-catalog.ts");
    expect(sources).toContain("ee/subscription/entitlements.ts");
  });

  it("binds LinkedIn social and Sales Navigator claims to MCP and REST authorities", () => {
    const socialSources = ACQUISITION_FACT_SOURCES["product:linkedin-social-workflows"];
    expect(socialSources).toContain("features/mcp-tools/social-posts.mcp-tools.ts");
    expect(socialSources).toContain("app/api/v1/messaging/social-profiles/search/route.ts");
    expect(socialSources).toContain("app/api/v1/messaging/social-posts/search/route.ts");
    expect(socialSources).toContain("app/api/v1/messaging/social-relations/invite/route.ts");

    const salesSources = ACQUISITION_FACT_SOURCES["product:sales-navigator-workflows"];
    expect(salesSources).toContain("features/mcp-tools/sales-navigator.mcp-tools.ts");
    expect(salesSources).toContain("app/api/v1/messaging/sales-navigator/search/people/route.ts");
    expect(salesSources).toContain("app/api/v1/messaging/sales-navigator/lists/save/route.ts");
  });

  it("keeps LinkedIn enrichment claims scoped to the implemented composed workflows", () => {
    const coreRecordSources = ACQUISITION_FACT_SOURCES["product:core-crm-records"];
    expect(coreRecordSources).toEqual(
      expect.arrayContaining([
        "features/mcp-tools/contact.mcp-tools.ts",
        "features/mcp-tools/organization.mcp-tools.ts",
        "app/api/v1/contacts/route.ts",
        "app/api/v1/contacts/[id]/route.ts",
        "app/api/v1/organizations/route.ts",
        "app/api/v1/organizations/[id]/route.ts",
      ]),
    );

    const pages = CONTENT_LOCALES.map((locale) => ({
      locale,
      ...readPage(contentFile("feature-pages", locale, "linkedin-integration")),
    }));
    for (const page of pages) {
      const acquisition = acquisitionPageSchema.parse(page.data.acquisition);
      expect(acquisition.proof.factReferences, page.locale).toContain("product:core-crm-records");
      expect(acquisition.proof.excludedClaims, page.locale).toContain(
        "claim:no-native-linkedin-enrichment-monitoring",
      );
      expect(page.body, page.locale).not.toMatch(
        /This is not CRM Sync, automatic enrichment|Automatic enrichment or job-change monitoring|Kein CRM Sync, keine automatische Anreicherung|Automatische Anreicherung oder Jobwechsel-Monitoring/u,
      );
    }

    expect(pages[0]?.body).toContain("A customer-run workflow can also call an enrichment provider");
    expect(pages[0]?.body).toContain("separate, permission-checked contact or organization create/update");
    expect(pages[1]?.body).toContain("Ein kundenseitig betriebener Workflow kann außerdem");
    expect(pages[1]?.body).toContain("separate, berechtigungsgeprüfte REST- oder MCP-Aktion");
    expect(pages[0]?.body).toContain(
      "https://www.linkedin.com/help/sales-navigator/answer/a105094/sales-navigator-application-platform-snap-overview?lang=en",
    );
    expect(pages[1]?.body).toContain(
      "https://www.linkedin.com/help/sales-navigator/answer/a109945/sales-navigator-application-platform-snap-uberblick?lang=de",
    );
  });

  it("binds the shared connected-account allowance to provider-agnostic enforcement", () => {
    const sources = ACQUISITION_FACT_SOURCES["product:unified-inbox-entitlements"];
    expect(sources).toContain("ee/messaging/connect/create-auth-link.interactor.ts");
    expect(sources).toContain("ee/messaging/persistence/prisma-connected-account.repository.ts");

    const allowance = readFileSync(join(REPO_ROOT, "ee/messaging/connect/create-auth-link.interactor.ts"), "utf8");
    expect(allowance).toContain("getEntitlements(subscription.plan).includedAccountsPerUser");
    expect(allowance).toContain("this.repo.countActiveAccountsForUser()");

    const repository = readFileSync(
      join(REPO_ROOT, "ee/messaging/persistence/prisma-connected-account.repository.ts"),
      "utf8",
    );
    const counter = /async countActiveAccountsForUser\(\) \{(?<body>[\s\S]*?)\n  \}/u.exec(repository)?.groups?.body;
    expect(counter).toContain("companyId: this.companyId");
    expect(counter).toContain("userId: this.userId");
    expect(counter).not.toContain("provider:");
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
        if (en[key] !== de[key])
          problems.push(
            `${collection}/${basename(slug)}: ${key} differs by locale`,
          );
      }
      if (JSON.stringify(en.proof) !== JSON.stringify(de.proof)) {
        problems.push(
          `${collection}/${basename(slug)}: proof boundary differs by locale`,
        );
      }
      if (
        JSON.stringify(en.structuredData) !== JSON.stringify(de.structuredData)
      ) {
        problems.push(
          `${collection}/${basename(slug)}: structured data differs by locale`,
        );
      }
      if (JSON.stringify(en.relatedHrefs) !== JSON.stringify(de.relatedHrefs)) {
        problems.push(
          `${collection}/${basename(slug)}: related graph differs by locale`,
        );
      }
      if (
        en.cta.buttonLeftHref !== de.cta.buttonLeftHref ||
        en.cta.buttonRightHref !== de.cta.buttonRightHref
      ) {
        problems.push(
          `${collection}/${basename(slug)}: CTA destinations differ by locale`,
        );
      }
    }

    expect(problems).toEqual([]);
  });
});
