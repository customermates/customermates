import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { PRODUCT_DEMO_PATHS, buildProductDemoUrl } from "@/components/marketing/product-demo";
import { REPO_ROOT, walkFiles } from "./walk";

type PageDemo = {
  file: string;
  path: string;
  precedingCopy: string;
  hostedBoundary?: boolean;
  presentation?: "standalone";
};

const PAGE_DEMOS: readonly PageDemo[] = [
  {
    file: "app/[locale]/(static)/features/page.tsx",
    path: "/dashboard",
    precedingCopy: "<FeaturesHero {...hero} />",
    hostedBoundary: true,
    presentation: "standalone",
  },
  {
    file: "content/feature-pages/en/cloud-crm.mdx",
    path: "/dashboard",
    precedingCopy: '<ProofRail label="Verified Customermates Cloud capabilities">',
    hostedBoundary: true,
  },
  {
    file: "content/feature-pages/de/cloud-crm.mdx",
    path: "/dashboard",
    precedingCopy: '<ProofRail label="Verifizierte Funktionen von Customermates Cloud">',
    hostedBoundary: true,
  },
  {
    file: "content/feature-pages/en/linkedin-integration.mdx",
    path: "/inbox",
    precedingCopy: '<ProofRail label="Verified LinkedIn CRM integration capabilities">',
    hostedBoundary: true,
  },
  {
    file: "content/feature-pages/de/linkedin-integration.mdx",
    path: "/inbox",
    precedingCopy: '<ProofRail label="Verifizierte Funktionen der LinkedIn CRM-Integration">',
    hostedBoundary: true,
  },
  {
    file: "content/feature-pages/en/unified-inbox.mdx",
    path: "/inbox",
    precedingCopy: "It is a managed-cloud feature from Pro upward.",
  },
  {
    file: "content/feature-pages/de/unified-inbox.mdx",
    path: "/inbox",
    precedingCopy: "Die Funktion gehört zur Managed Cloud ab Pro.",
  },
  {
    file: "content/for-pages/en/professional-services.mdx",
    path: "/deals",
    precedingCopy: "<ProofRail label=\"Verified professional-services CRM capabilities\">",
  },
  {
    file: "content/for-pages/de/professional-services.mdx",
    path: "/deals",
    precedingCopy: "<ProofRail label=\"Verifizierte CRM-Funktionen für Dienstleister\">",
  },
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
  it("builds locale-aware URLs for only the three reviewed demo surfaces", () => {
    expect(PRODUCT_DEMO_PATHS).toStrictEqual(["/dashboard", "/inbox", "/deals"]);
    expect(buildProductDemoUrl("en", "/inbox")).toBe(
      "https://demo.customermates.com/en/inbox?agentChat=closed",
    );
    expect(buildProductDemoUrl("de", "/deals")).toBe(
      "https://demo.customermates.com/de/deals?agentChat=closed",
    );
    expect(() => buildProductDemoUrl("en", "/contacts")).toThrow("Unsupported product demo path: /contacts");
  });

  it("registers one disclosed, appropriately placed demo per reviewed source", () => {
    for (const page of PAGE_DEMOS) {
      const source = read(page.file);
      const expectedTag = page.presentation
        ? `<ProductDemo hostedBoundary path="${page.path}" presentation="${page.presentation}" />`
        : page.hostedBoundary
          ? `<ProductDemo hostedBoundary path="${page.path}" />`
          : `<ProductDemo path="${page.path}" />`;

      expect(source.match(/<ProductDemo\b/gu)).toHaveLength(1);
      expect(source).toContain(expectedTag);
      expect(source.indexOf(expectedTag)).toBeGreaterThan(source.indexOf(page.precedingCopy));
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
    expect(discovered).toStrictEqual(PAGE_DEMOS.map((page) => page.file).sort());

    const componentRegistry = read("core/fumadocs/mdx-components.tsx");
    expect(componentRegistry).toContain('import { ProductDemo } from "@/components/marketing/product-demo";');
    expect(componentRegistry).toMatch(/\n\s*ProductDemo,\n/u);
  });

  it("keeps disclosure, accessibility and lazy sandboxing in the shared component", () => {
    const demo = read("components/marketing/product-demo.tsx");
    const frame = read("components/marketing/browser-frame.tsx");
    const proxy = read("proxy.ts");
    const navigationSwitch = read("app/components/navigation/navigation-switch.tsx");

    expect(demo).toContain("Public, seeded product demo");
    expect(demo).toContain("synthetic sample data");
    expect(demo).toContain("Öffentliche, vorbefüllte Produktdemo");
    expect(demo).toContain("not a self-hosted deployment");
    expect(demo).toContain("kein Self-Hosted-Deployment");
    expect(demo).toContain("When Mate is enabled for this demo environment, it starts closed");
    expect(demo).toContain("Wenn Mate für diese Demo-Umgebung aktiviert ist, startet es geschlossen");
    expect(demo).not.toMatch(/(?:^|[.!?]\s+)Mate starts closed/);
    expect(demo).not.toMatch(/(?:^|[.!?]\s+)Mate startet geschlossen/);
    expect(demo).toContain("copy.guidedTasks[path].map");
    expect(demo).toContain('presentation = "article"');
    expect(demo).toContain("data-product-demo-presentation={presentation}");
    expect(demo).toContain('presentation === "article" && "border-y border-border py-5"');
    expect(demo).toContain("fallbackMessage={copy.fallback}");
    expect(demo).toContain("title={copy.titles[path]}");
    expect(demo).toContain('size="article"');

    expect(frame).toContain('size?: "article" | "full"');
    expect(frame).toContain('article: "h-[420px] sm:h-[520px] lg:h-[600px]"');
    expect(frame).toContain("IntersectionObserver");
    expect(frame).toContain('loading="lazy"');
    expect(frame).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-forms"');
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
