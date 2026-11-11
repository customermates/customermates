import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { INDUSTRY_PRODUCT_DEMOS } from "@/components/marketing/product-demo-config";
import {
  DEMO_RECORD_LIST_PATHS,
  PRODUCT_DEMO_PATHS,
  buildProductDemoUrl,
} from "@/components/marketing/product-demo";
import {
  DEMO_DEFAULT_RECORD_TYPE_IDS,
  DEMO_RECORD_TYPE_IDS,
  demoWorkspacePath,
} from "@/components/marketing/product-demo-src";
import {
  PROFESSIONAL_SERVICES_SOLUTION_ID,
  DEMO_DEFAULT_SOLUTION_ID,
  SOLUTION_CATALOG,
  SOLUTION_DATA_LOCALES,
  findSolution,
} from "@/core/solutions/solution-catalog";
import { presetId } from "@/features/records/crm-preset";
import { SEED_IDS } from "@/prisma/seeds/context";
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
  {
    file: "content/blog-posts/fr/open-source-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Où se situe Customermates",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/fr/free-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Où se place Customermates",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/it/open-source-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Dove si colloca Customermates",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/it/free-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Dove si colloca Customermates",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/es/open-source-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Dónde encaja Customermates",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/es/free-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Dónde encaja Customermates",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/pt/open-source-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Onde o Customermates se encaixa",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/pt/free-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Onde o Customermates se encaixa",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/pl/open-source-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Gdzie pasuje Customermates",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/pl/free-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Gdzie pasuje Customermates",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/nl/open-source-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Waar Customermates past",
    hostedBoundary: true,
  },
  {
    file: "content/blog-posts/nl/free-crm.mdx",
    path: "/dashboard",
    precedingCopy: "## Waar Customermates past",
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
      `/records/${presetId(SEED_IDS.company, "deal")}`,
      `/records/${presetId(SEED_IDS.company, "contact")}`,
      `/records/${presetId(SEED_IDS.company, "organization")}`,
      `/records/${presetId(SEED_IDS.company, "task")}`,
      "/settings/api-keys",
      "/settings/channels",
      "/settings/webhooks",
    ]);
    expect(buildProductDemoUrl("en", "/inbox")).toBe(
      "https://demo.customermates.com/en/w/small-business/inbox?threadId=latest&agentChat=closed",
    );
    expect(buildProductDemoUrl("de", DEMO_RECORD_LIST_PATHS.deals)).toBe(
      `https://demo.customermates.com/de/w/kleine-unternehmen/records/${presetId(findSolution("smb").companyIds.de, "deal")}?agentChat=closed`,
    );
    expect(
      buildProductDemoUrl(
        "fr",
        "/dashboard",
        "agencies",
      ),
    ).toBe(
      "https://demo.customermates.com/fr/w/agencies/dashboard?agentChat=closed",
    );
    expect(
      buildProductDemoUrl(
        "de",
        "/dashboard",
        "agencies",
      ),
    ).toBe(
      "https://demo.customermates.com/de/w/agenturen/dashboard?agentChat=closed",
    );
    expect(() => buildProductDemoUrl("en", "/deals")).toThrow(
      "Unsupported product demo path: /deals",
    );
    expect(() =>
      buildProductDemoUrl(
        "en",
        `/records/${presetId(SEED_IDS.company, "service")}`,
      ),
    ).toThrow("Unsupported product demo path");
  });

  it("opens every default demo list in the workspace of the page's data locale", () => {
    const solution = findSolution(DEMO_DEFAULT_SOLUTION_ID);
    const keys = { contacts: "contact", deals: "deal", organizations: "organization", tasks: "task" } as const;
    for (const dataLocale of SOLUTION_DATA_LOCALES)
      for (const list of Object.keys(DEMO_RECORD_TYPE_IDS) as Array<keyof typeof keys>)
        expect(DEMO_DEFAULT_RECORD_TYPE_IDS[dataLocale][list], `${dataLocale} ${list}`).toBe(
          presetId(solution.companyIds[dataLocale], keys[list]),
        );
    expect(demoWorkspacePath("fr", DEMO_RECORD_LIST_PATHS.tasks)).toBe(
      `/fr/w/small-business/records/${DEMO_RECORD_TYPE_IDS.tasks}`,
    );
    expect(demoWorkspacePath("de", `/configure?focus=list:${DEMO_RECORD_TYPE_IDS.deals}`)).toBe(
      `/de/w/kleine-unternehmen/configure?focus=list:${DEMO_DEFAULT_RECORD_TYPE_IDS.de.deals}`,
    );
  });

  it("maps every industry page to its reviewed demo surface and builds feature pages from signature visuals", () => {
    for (const solution of SOLUTION_CATALOG) {
      const slug = solution.landingPath.split("/").at(-1)!;
      if (!solution.landingPath.startsWith("/for/")) continue;
      const demo = INDUSTRY_PRODUCT_DEMOS[slug];
      expect(demo, solution.landingPath).toMatchObject({
        path: solution.previewRoute,
        solutionId: solution.id,
      });
    }
    expect(INDUSTRY_PRODUCT_DEMOS["professional-services"]).toStrictEqual({
      path: findSolution(PROFESSIONAL_SERVICES_SOLUTION_ID).previewRoute,
      solutionId: PROFESSIONAL_SERVICES_SOLUTION_ID,
    });
    expect(Object.keys(INDUSTRY_PRODUCT_DEMOS).sort()).toStrictEqual(
      [
        "professional-services",
        ...SOLUTION_CATALOG.filter((solution) =>
          solution.landingPath.startsWith("/for/"),
        ).map((solution) => solution.landingPath.slice("/for/".length)),
      ].sort(),
    );

    const featureRoute = read("app/[locale]/(static)/features/[slug]/page.tsx");
    const industryRoute = read("app/[locale]/(static)/for/[industry]/page.tsx");
    expect(featureRoute.indexOf("<LandingVisual")).toBeGreaterThan(-1);
    expect(featureRoute.indexOf("<LandingVisual")).toBeLessThan(featureRoute.indexOf("<LandingArticle"));
    expect(industryRoute).toContain("productDemoForIndustry(industry)");
    expect(industryRoute.indexOf("<SolutionStageSection")).toBeLessThan(industryRoute.indexOf("<LandingArticle"));
    expect(existsSync(join(REPO_ROOT, "components/marketing/product-demo-section.tsx"))).toBe(false);
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

  it("keeps disclosure, accessibility, bounded preloading and sandboxing in the shared component", () => {
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
    expect(demo).toContain("keine selbst gehostete Installation");
    expect(demo).toContain(
      "When Mate is enabled for this demo environment, it starts closed",
    );
    expect(demo).toContain(
      "Ist Mate in dieser Demo aktiviert, bleibt das Mate-Fenster anfangs geschlossen",
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
    expect(demo).not.toContain("size={");

    expect(frame).toContain("<ProductWindow");
    expect(frame).toContain("DESKTOP_VIEWPORT = { height: 900, width: 1440 }");
    expect(frame).toContain("BROWSER_FRAME_REVEAL_DELAY_MS = 500");
    expect(frame).not.toContain("BrowserFrame.live");
    expect(frame).toContain("IntersectionObserver");
    expect(frame).toContain("loadAhead?: boolean");
    expect(frame).toContain('const LOAD_AHEAD_MARGIN = "400px 0px"');
    expect(frame).toContain(
      "loadAhead ? { rootMargin: LOAD_AHEAD_MARGIN } : undefined",
    );
    expect(frame).toContain("prefetchDNS(origin)");
    expect(frame).toContain("preconnect(origin)");
    expect(frame).toContain('loading={loadAhead ? "eager" : "lazy"}');
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
