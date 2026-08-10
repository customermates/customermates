import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { PROTECTED_ROUTE_REGISTRY } from "@/components/page-state/route-registry";

import { REPO_ROOT, walkFiles } from "./walk";

const PROTECTED_ROOT = join(REPO_ROOT, "app/[locale]/(protected)");

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function productRoutes(): string[] {
  return walkFiles(PROTECTED_ROOT, (path) => path.endsWith("/page.tsx") && !path.includes("/test/"))
    .map((path) => `/${relative(PROTECTED_ROOT, path).replace(/\/page\.tsx$/, "")}`)
    .sort();
}

function nearestLoadingOwner(pagePath: string): string | null {
  let current = dirname(pagePath);
  while (current.startsWith(PROTECTED_ROOT)) {
    const candidate = join(current, "loading.tsx");
    if (existsSync(candidate)) return relative(REPO_ROOT, candidate);
    if (current === PROTECTED_ROOT) break;
    current = dirname(current);
  }
  return null;
}

describe("page-state contract", () => {
  it("registers every protected non-test route and gives it a loading owner", () => {
    const routes = productRoutes();
    const registered = Object.keys(PROTECTED_ROUTE_REGISTRY).sort();
    const pages = walkFiles(PROTECTED_ROOT, (path) => path.endsWith("/page.tsx") && !path.includes("/test/"));

    expect(routes).toEqual(registered);
    expect(routes).toHaveLength(25);
    expect(pages.map(nearestLoadingOwner).filter(Boolean)).toHaveLength(25);

    for (const route of routes) {
      const spec = PROTECTED_ROUTE_REGISTRY[route as keyof typeof PROTECTED_ROUTE_REGISTRY];
      const pagePath = join(PROTECTED_ROOT, route.slice(1), "page.tsx");
      const declaredOwner = join(PROTECTED_ROOT, spec.loadingOwner.slice(1), "loading.tsx");

      expect(nearestLoadingOwner(pagePath), route).toBe(relative(REPO_ROOT, declaredOwner));
      expect(typeof spec.trueEmpty, route).toBe("boolean");
      expect(spec.errorOwner, route).toMatch(/route-boundary/);
      expect(spec.skeleton, route).toBeDefined();
    }
  });

  it("keeps route fallbacks in-flow and leaves the protected shell mounted", () => {
    const loadingFiles = walkFiles(join(REPO_ROOT, "app/[locale]"), (path) => path.endsWith("/loading.tsx"));
    const violations = loadingFiles.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return /\bfixed\b|z-9999|bg-black\/50/.test(source) ? [relative(REPO_ROOT, path)] : [];
    });

    expect(existsSync(join(PROTECTED_ROOT, "loading.tsx"))).toBe(true);
    expect(violations).toEqual([]);
    expect(read("app/[locale]/(protected)/layout.tsx")).toContain("{children}");
    expect(read("app/[locale]/loading.tsx")).not.toContain("<main");

    const routeLoading = read("components/page-state/route-loading.tsx");
    expect(routeLoading).toContain('skeleton.kind === "detail"');
    expect(routeLoading).toContain('centered ? "h-full flex-1"');
    const pageSkeleton = read("components/page-state/page-skeleton.tsx");
    expect(pageSkeleton).toContain('@container/detail h-full min-h-[34rem]');
    expect(pageSkeleton).toContain("@4xl/detail:grid-cols-");
    expect(pageSkeleton).toContain("@6xl/detail:grid-cols-");
  });

  it("uses one placeholder token with reduced-motion support in both themes", () => {
    const skeleton = read("components/ui/skeleton.tsx");
    const styles = read("styles/globals.css");

    expect(skeleton).toContain("bg-placeholder");
    expect(skeleton).toContain("motion-reduce:animate-none");
    expect(skeleton).not.toContain("bg-accent");
    expect(styles).toContain("--color-placeholder: var(--placeholder)");
    expect(styles.match(/--placeholder:/g)).toHaveLength(2);
  });

  it("keeps page geometry pure, bounded, and independent from Assistant state", () => {
    const files = ["components/page-state/page-state.tsx", "components/page-state/page-skeleton.tsx"];
    const banned = [
      '"use client"',
      "useEffect",
      "useLayoutEffect",
      "useState",
      "setTimeout",
      "setInterval",
      "fetch(",
      "ResizeObserver",
      "window.",
      "document.",
      "agent-chat",
      "assistantStore",
    ];

    for (const file of files) {
      const source = read(file);
      for (const needle of banned) expect(source, `${file} contains ${needle}`).not.toContain(needle);
    }
    expect(read("components/page-state/page-skeleton.tsx")).toContain("Array.from({ length: 8 }");
  });

  it("never leaves a shared data view blank while readiness is pending", () => {
    const container = read("components/data-view/data-view-container.tsx");

    expect(container).toContain("resolveDataViewPageState");
    expect(container).toContain('pageState === "loading"');
    expect(container).not.toContain("if (!store.isReady) return null");
    expect(container).toContain("h-[calc(100svh-4rem)]");
    expect(container).toContain('contain: "layout"');
  });

  it("keeps query refresh local and reserves the global overlay for mutations", () => {
    const store = read("core/base/base-data-view.store.ts");
    const start = store.indexOf("async persistQueryOptions");
    const end = store.indexOf("withUrlSync", start);
    const persist = store.slice(start, end);

    expect(persist).toContain("this.isRefreshing = true");
    expect(persist).toContain("this.refreshError = error");
    expect(persist).not.toContain("loadingOverlayStore");
  });

  it("shares the same pending-link affordance across every navigation group", () => {
    for (const file of [
      "app/components/navigation/nav-main.tsx",
      "app/components/navigation/nav-secondary.tsx",
      "app/components/navigation/nav-header.tsx",
    ]) {
      expect(read(file), file).toContain("NavLinkPendingIndicator");
    }

    expect(read("app/components/navigation/nav-main.tsx")).not.toContain("NavLinkOverlayBridge");
    expect(read("i18n/navigation.ts")).not.toContain("loadingOverlayStore");
    const pendingIndicator = read("app/components/navigation/nav-link-pending-indicator.tsx");
    expect(pendingIndicator).toContain('closest("a")');
    expect(pendingIndicator).toContain('setAttribute("aria-busy", "true")');
  });

  it("propagates validated entity-list failures instead of fabricating empty records", () => {
    for (const entity of ["contacts", "organizations", "deals", "services", "tasks"]) {
      for (const suffix of ["page.tsx", "actions.ts"]) {
        const file = `app/[locale]/(protected)/${entity}/${suffix}`;
        const source = read(file);
        expect(source, file).toContain("unwrapValidated");
        expect(source, file).not.toContain("result.ok ? result.data : { items: [] }");
      }
    }
  });
});
