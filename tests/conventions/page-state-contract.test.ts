import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const filesUnder = (directory: string): string[] =>
  readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });

const protectedRoot = "app/[locale]/(protected)";
const protectedPages = filesUnder(protectedRoot)
  .filter((path) => path.endsWith("/page.tsx"))
  .map((path) => path.slice(protectedRoot.length + 1))
  .filter((path) => !path.startsWith("test/"))
  .sort();
const protectedLoaders = protectedPages.map((page) => join(protectedRoot, dirname(page), "loading.tsx"));

const collectionViews = [
  "app/[locale]/(protected)/contacts/components/contacts-page-view.tsx",
  "app/[locale]/(protected)/organizations/components/organizations-page-view.tsx",
  "app/[locale]/(protected)/deals/components/deals-page-view.tsx",
  "app/[locale]/(protected)/services/components/services-page-view.tsx",
  "app/[locale]/(protected)/tasks/components/tasks-page-view.tsx",
  "app/[locale]/(protected)/company/components/user/members-page-view.tsx",
  "app/[locale]/(protected)/company/components/role/roles-page-view.tsx",
  "app/[locale]/(protected)/company/components/audit-log/audit-logs-page-view.tsx",
  "app/[locale]/(protected)/routines/components/routines-page-view.tsx",
  "app/[locale]/(protected)/company/components/webhook/webhooks-page-view.tsx",
  "app/[locale]/(protected)/company/components/webhook/webhook-deliveries-page-view.tsx",
] as const;

const pureSkeletons = [
  "components/data-view/data-view-skeleton.tsx",
  "components/entity-detail/entity-detail-page-skeleton.tsx",
  "components/forms/settings-form-skeleton.tsx",
  "components/shared/centered-card-page-skeleton.tsx",
  "app/[locale]/(protected)/dashboard/components/dashboard-page-skeleton.tsx",
  "app/[locale]/(protected)/inbox/components/inbox-page-skeleton.tsx",
  "app/[locale]/(protected)/profile/components/profile-resource-page-skeleton.tsx",
  "features/messaging/activities/activity-timeline-skeleton.tsx",
] as const;

const featureSkeletons = [
  "app/[locale]/(protected)/profile/components/profile-settings-page-skeleton.tsx",
  "app/[locale]/(protected)/company/components/company-settings/company-settings-page-skeleton.tsx",
  "app/[locale]/(protected)/company/components/subscription/subscription-page-skeleton.tsx",
  "app/[locale]/(protected)/onboarding/wizard/components/onboarding-page-skeleton.tsx",
] as const;

const exhaustiveResourceOwners = [
  ["app/[locale]/(protected)/dashboard/components/dashboard-page-view.tsx", "switch (pageState)"],
  ["app/[locale]/(protected)/profile/components/api-keys-page-view.tsx", "switch (pageState)"],
  ["app/[locale]/(protected)/profile/components/connected-accounts-page-view.tsx", "switch (pageState)"],
  ["app/[locale]/(protected)/inbox/components/inbox-list.tsx", "switch (pageState)"],
  ["app/[locale]/(protected)/inbox/components/thread-panel.tsx", "switch (pageState.status)"],
  ["components/entity-detail/entity-drawer.tsx", "switch (drawerState)"],
] as const;

describe("page-state ownership", () => {
  it("gives every protected product route a direct feature or family loader", () => {
    expect(protectedLoaders).toHaveLength(30);
    for (const path of protectedLoaders) {
      expect(existsSync(resolve(root, path)), path).toBe(true);
      expect(existsSync(resolve(root, dirname(path), "page.tsx")), `${path}:page`).toBe(true);
      const source = read(path);
      expect(source, path).not.toMatch(/\bRouteLoading\b|\bPageSkeleton\b|route-registry/);
      expect(source, path).toMatch(/PageState|EntityDetailRouteLoading/);
      expect(source, path).toMatch(/Skeleton|EntityDetailRouteLoading/);
      expect(source, path).not.toMatch(/\bfixed\b|\binset-0\b|z-\d+/);
    }
  });

  it("keeps resource and drawer state ownership exhaustive", () => {
    for (const [path, switchExpression] of exhaustiveResourceOwners) {
      const source = read(path);
      expect(source, path).toContain(switchExpression);
      expect(source, path).toContain("const exhaustive: never");
    }
  });

  it("keeps each collection page's five-state switch visible and exhaustive", () => {
    for (const path of collectionViews) {
      const source = read(path);
      expect(source, path).toContain("switch (pageState)");
      for (const state of ["error", "loading", "filtered-empty", "true-empty", "content"]) {
        expect(source, `${path}:${state}`).toContain(`case "${state}"`);
      }
      expect(source, path).toContain("const exhaustive: never = pageState");
      expect(source, path).not.toMatch(/DataViewContainer|useState\(|useEffect\(/);
    }
  });

  it("removes the central route, skeleton-spec, and collection adapters", () => {
    for (const path of [
      "components/data-view/data-view-container.tsx",
      "components/page-state/page-skeleton.tsx",
      "components/page-state/route-loading.tsx",
      "components/page-state/route-registry.ts",
    ]) expect(existsSync(resolve(root, path)), path).toBe(false);

    const productionFiles = ["app", "components", "core", "features"]
      .flatMap(filesUnder)
      .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
      .filter((path) => !path.includes("/__tests__/") && !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"));
    const legacyPattern =
      /\bDataViewContainer\b|\bPageSkeletonSpec\b|\bPageSkeleton\b|\bRouteLoading\b|\bPROTECTED_ROUTE_REGISTRY\b|\bgetProtectedRouteSpec\b/;
    for (const path of productionFiles) expect(read(path), path).not.toMatch(legacyPattern);
    expect(read("components/page-state/page-state.tsx")).not.toMatch(/\bskeleton[?:=]/);
    expect(read("core/base/base-data-view.store.ts")).not.toContain("refreshError");
  });

  it("keeps skeleton composition server-compatible and side-effect free", () => {
    for (const path of pureSkeletons) {
      const source = read(path);
      expect(source, path).not.toContain('"use client"');
      expect(source, path).not.toMatch(/use(State|Effect|LayoutEffect|Reducer)|useRootStore|window\.|fetch\(|setTimeout|setInterval/);
      expect(source, path).toContain("data-page-skeleton-loading");
      expect(source, path).toContain("data-page-skeleton-empty");
    }

    for (const path of featureSkeletons) {
      const source = read(path);
      expect(source, path).not.toContain('"use client"');
      expect(source, path).not.toMatch(/use(State|Effect|LayoutEffect|Reducer)|useRootStore|window\.|fetch\(|setTimeout|setInterval/);
    }
  });

  it("does not start connected-account work behind locked surfaces", () => {
    expect(read("app/[locale]/(protected)/profile/components/connected-accounts-page-view.tsx")).toContain(
      "if (locked) return;",
    );
    expect(read("app/[locale]/(protected)/inbox/components/inbox-list.tsx")).toContain("if (locked) return;");
  });

  it("keeps the neutral public and internal-test loaders generic", () => {
    for (const path of ["app/[locale]/(public)/loading.tsx", "app/[locale]/(protected)/test/loading.tsx"]) {
      const source = read(path);
      expect(source, path).toContain("GenericPageLoading");
      expect(source, path).not.toMatch(/PageState|PageSkeleton|RouteLoading|<main|\bfixed\b/);
    }
  });

  it("keeps loading boundaries out of every segment whose status code has to survive", () => {
    // A loader puts a Suspense boundary above everything below it. React commits 200 with the shell
    // before that subtree runs, so notFound() renders a 404 card inside a 200 and permanentRedirect()
    // degrades to a meta refresh. Two surfaces cannot afford that. Marketing and docs pages are
    // indexed, and a crawler reads either as a live page, so nothing above (static) may carry a
    // loader. A layout that calls notFound() is an authorization boundary, and a denied viewer must
    // get the same 404 as a route that does not exist, so nothing above such a layout may carry one
    // either. That is why the (protected) group has no catch-all loader: its only pages without a
    // direct loader are the internal test routes, which hold one of their own.
    expect(existsSync(resolve(root, "app/[locale]/loading.tsx")), "app/[locale]/loading.tsx").toBe(false);
    const staticLoaders = filesUnder("app/[locale]/(static)").filter((path) => path.endsWith("loading.tsx"));
    expect(staticLoaders, "loading.tsx under (static)").toEqual([]);

    const guardedLayouts = filesUnder("app")
      .filter((path) => path.endsWith("/layout.tsx"))
      .filter((path) => /\bnotFound\(\)/.test(read(path)));
    expect(guardedLayouts.length).toBeGreaterThan(0);
    for (const layout of guardedLayouts) {
      let segment = dirname(dirname(layout));
      while (segment.startsWith("app")) {
        const loader = join(segment, "loading.tsx");
        expect(existsSync(resolve(root, loader)), `${loader} sits above ${layout}`).toBe(false);
        if (segment === "app") break;
        segment = dirname(segment);
      }
    }
  });

  it("keeps loading motion shape-only and disabled for reduced motion", () => {
    const styles = read("styles/globals.css");
    expect(styles).toContain("[data-page-skeleton-loading] [data-skeleton-motion]");
    expect(styles).toContain("[data-page-skeleton-loading] [data-skeleton-breathe]");
    expect(styles).toContain("[data-page-skeleton-empty]");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("animation: none");
  });
});
