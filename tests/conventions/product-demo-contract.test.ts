import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FEATURE_PRODUCT_DEMOS,
  INDUSTRY_PRODUCT_DEMOS,
} from "@/components/marketing/product-demo-config";
import {
  PRODUCT_DEMO_PATHS,
  buildProductDemoUrl,
} from "@/components/marketing/product-demo";
import { REPO_ROOT, walkFiles } from "./walk";

type PageDemo = {
  file: string;
  hostedBoundary?: true;
  path: string;
  precedingCopy: string;
};

const INLINE_PAGE_DEMOS: readonly PageDemo[] = [
  {
    file: "content/blog-posts/en/open-source-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Where Customermates fits",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/de/open-source-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Wo Customermates passt",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/en/free-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Where Customermates fits",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/de/free-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Wo Customermates einzuordnen ist",
    hostedBoundary: true,
  },
];

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

describe("seeded public product demo", () => {
  it("builds locale-aware URLs only for reviewed demo surfaces", () => {
    expect(PRODUCT_DEMO_PATHS).toStrictEqual([
      "/dashboard",
      "/inbox",
      "/deals",
      "/contacts",
      "/organizations",
      "/tasks",
      "/profile/api-keys",
      "/profile/connected-accounts",
      "/company/webhooks",
    ]);
    expect(buildProductDemoUrl("en", "/inbox")).toBe(
      "https://demo.customermates.com/en/inbox?agentChat=closed",
    );
    expect(buildProductDemoUrl("de", "/deals")).toBe(
      "https://demo.customermates.com/de/deals?agentChat=closed",
    );
    expect(buildProductDemoUrl("en", "/contacts")).toBe(
      "https://demo.customermates.com/en/contacts?agentChat=closed",
    );
    expect(() => buildProductDemoUrl("en", "/services")).toThrow(
      "Unsupported product demo path: /services",
    );
  });

  it("maps every localized feature page to one relevant reviewed demo surface", () => {
    const englishSlugs = walkFiles(
      join(REPO_ROOT, "content", "feature-pages", "en"),
      (path) => path.endsWith(".mdx"),
    )
      .map((path) =>
        relative(
          join(REPO_ROOT, "content", "feature-pages", "en"),
          path,
        ).replace(/\.mdx$/u, ""),
      )
      .sort();
    const germanSlugs = walkFiles(
      join(REPO_ROOT, "content", "feature-pages", "de"),
      (path) => path.endsWith(".mdx"),
    )
      .map((path) =>
        relative(
          join(REPO_ROOT, "content", "feature-pages", "de"),
          path,
        ).replace(/\.mdx$/u, ""),
      )
      .sort();

    expect(germanSlugs).toStrictEqual(englishSlugs);
    expect(Object.keys(FEATURE_PRODUCT_DEMOS).sort()).toStrictEqual(
      englishSlugs,
    );
    expect(
      Object.values(FEATURE_PRODUCT_DEMOS).every(({ path }) =>
        PRODUCT_DEMO_PATHS.includes(path),
      ),
    ).toBe(true);
    expect(FEATURE_PRODUCT_DEMOS["self-hosted"].hostedBoundary).toBe(true);
    expect(FEATURE_PRODUCT_DEMOS["crm-integration"]).toStrictEqual({
      path: "/company/webhooks",
    });
    expect(FEATURE_PRODUCT_DEMOS["sales-automation"]).toStrictEqual({
      path: "/company/webhooks",
    });
    for (const slug of [
      "customer-service",
      "email-integration",
      "integrations",
      "linkedin-integration",
      "outlook-integration",
      "unified-inbox",
    ] as const) {
      expect(FEATURE_PRODUCT_DEMOS[slug].hostedBoundary, slug).toBe(true);
    }
    expect(INDUSTRY_PRODUCT_DEMOS).toStrictEqual({
      "professional-services": { path: "/deals" },
    });

    const featureRoute = read("app/[locale]/(static)/features/[slug]/page.tsx");
    const industryRoute = read("app/[locale]/(static)/for/[industry]/page.tsx");
    const demoSection = read("components/marketing/product-demo-section.tsx");
    expect(featureRoute).toContain("productDemoForFeature(slug)");
    expect(featureRoute.indexOf("<ProductDemoSection")).toBeLessThan(
      featureRoute.indexOf("<LandingArticle"),
    );
    expect(industryRoute).toContain("productDemoForIndustry(industry)");
    expect(industryRoute.indexOf("<ProductDemoSection")).toBeLessThan(
      industryRoute.indexOf("<LandingArticle"),
    );
    expect(demoSection).toContain('containerSize="wide"');
    expect(demoSection).toContain('presentation="standalone"');
  });

  it("keeps long-form blog demos inline and disclosed", () => {
    for (const page of INLINE_PAGE_DEMOS) {
      const source = read(page.file);
      const expectedTag = `<ProductDemo hostedBoundary path="${page.path}" />`;

      expect(source.match(/<ProductDemo\b/gu)).toHaveLength(1);
      expect(source).toContain(expectedTag);
      expect(source.indexOf(expectedTag)).toBeGreaterThan(
        source.indexOf(page.precedingCopy),
      );
    }

    const discovered = [join(REPO_ROOT, "content"), join(REPO_ROOT, "app")]
      .flatMap((root) =>
        walkFiles(root, (path) => {
          if (!/\.(?:mdx|tsx)$/u.test(path)) return false;
          return /<ProductDemo\b/u.test(readFileSync(path, "utf8"));
        }),
      )
      .map((path) => relative(REPO_ROOT, path))
      .sort();
    expect(discovered).toStrictEqual(
      INLINE_PAGE_DEMOS.map((page) => page.file).sort(),
    );

    const componentRegistry = read("core/fumadocs/mdx-components.tsx");
    expect(componentRegistry).toContain(
      'import { ProductDemo } from "@/components/marketing/product-demo";',
    );
    expect(componentRegistry).toMatch(/\n\s*ProductDemo,\n/u);
  });

  it("keeps disclosure, accessibility and lazy sandboxing in the shared component", () => {
    const demo = read("components/marketing/product-demo.tsx");
    const frame = read("components/marketing/browser-frame.tsx");
    const proxy = read("proxy.ts");
    const navigationSwitch = read(
      "app/components/navigation/navigation-switch.tsx",
    );

    expect(demo).toContain("Public, seeded product demo");
    expect(demo).toContain("synthetic sample data");
    expect(demo).toContain("Öffentliche, vorbefüllte Produktdemo");
    expect(demo).toContain("not a self-hosted deployment");
    expect(demo).toContain("kein Self-Hosted-Deployment");
    expect(demo).toContain(
      "When Mate is enabled for this demo environment, it starts closed",
    );
    expect(demo).toContain(
      "Wenn Mate für diese Demo-Umgebung aktiviert ist, startet es geschlossen",
    );
    expect(demo).not.toMatch(/(?:^|[.!?]\s+)Mate starts closed/);
    expect(demo).not.toMatch(/(?:^|[.!?]\s+)Mate startet geschlossen/);
    expect(demo).toContain("copy.guidedTasks[path].map");
    expect(demo).toContain('presentation = "article"');
    expect(demo).toContain("data-product-demo-presentation={presentation}");
    expect(demo).toContain(
      'presentation === "article" && "border-y border-border py-5"',
    );
    expect(demo).toContain("fallbackMessage={copy.fallback}");
    expect(demo).toContain("title={copy.titles[path]}");
    expect(demo).toContain(
      'size={presentation === "standalone" ? "full" : "article"}',
    );

    expect(frame).toContain('size?: "article" | "full"');
    expect(frame).toContain('article: "h-[420px] sm:h-[520px] lg:h-[600px]"');
    expect(frame).toContain("IntersectionObserver");
    expect(frame).toContain('loading="lazy"');
    expect(frame).toContain(
      'sandbox="allow-scripts allow-same-origin allow-popups allow-forms"',
    );
    expect(frame).toContain('referrerPolicy="strict-origin-when-cross-origin"');
    expect(frame).toContain("12_000");
    expect(frame).toContain("motion-reduce:animate-none");
    expect(frame).toContain('target="_blank"');
    expect(proxy).toContain(
      'if (env.APP_MODE !== "demo" && isAuthenticated && preferredLocale && preferredLocale !== currentLocale)',
    );
    expect(navigationSwitch).toContain(
      'rootStore.appMode === "demo" ? null : <AppLocalePreferenceSync displayLanguage={userDisplayLanguage} />',
    );
  });
});
