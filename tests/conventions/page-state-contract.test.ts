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

    const localeFallback = read("app/[locale]/loading.tsx");
    const protectedFallback = read("app/[locale]/(protected)/loading.tsx");
    const genericFallback = read("components/page-state/generic-page-loading.tsx");

    expect(localeFallback).toContain("GenericPageLoading");
    expect(localeFallback).not.toMatch(
      /components\/page-state\/page-state|PageSkeleton|kind: "settings"|min-h-svh|<main/,
    );
    expect(protectedFallback).toContain("GenericPageLoading");
    expect(protectedFallback).not.toMatch(/RouteLoading|route="\/dashboard"/);
    expect(genericFallback).toContain("flex min-h-0 w-full flex-1 items-center justify-center");
    expect(genericFallback).toContain("Spinner");
    expect(genericFallback).not.toMatch(/PageState|PageSkeleton|<main|<button|\bfixed\b/);
    expect(read("components/ui/spinner.tsx")).toContain("motion-reduce:animate-none");

    const routeLoading = read("components/page-state/route-loading.tsx");
    expect(routeLoading).toContain('skeleton.kind === "detail"');
    expect(routeLoading).toContain('centered ? "h-full flex-1"');
    const pageSkeleton = read("components/page-state/page-skeleton.tsx");
    expect(pageSkeleton).toContain('@container/detail flex h-full min-h-0');
    expect(pageSkeleton).toContain("@4xl/detail:grid-cols-");
    expect(pageSkeleton).toContain("@6xl/detail:grid-cols-");
  });

  it("shares exact data-view geometry with loaded cards, boards, and pagination", () => {
    const geometryNames = [
      "DATA_CARD_GRID_CLASS_NAME",
      "DATA_KANBAN_TRACK_CLASS_NAME",
      "DATA_KANBAN_COLUMN_CLASS_NAME",
    ];
    const skeleton = read("components/page-state/page-skeleton.tsx");
    const cards = read("components/data-view/data-card-view.tsx");
    const board = read("components/data-view/data-kanban-view.tsx");

    expect(read("components/data-view/data-view-geometry.ts")).toContain(
      "grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
    );
    for (const name of geometryNames) expect(skeleton, name).toContain(name);
    expect(cards).toContain("DATA_CARD_GRID_CLASS_NAME");
    expect(board).toContain("DATA_KANBAN_TRACK_CLASS_NAME");
    expect(board).toContain("DATA_KANBAN_COLUMN_CLASS_NAME");
    expect(read("components/data-view/header/pagination.tsx")).toContain("DATA_VIEW_PAGINATION_RAIL_CLASS_NAME");
    expect(skeleton).toContain("DATA_VIEW_PAGINATION_RAIL_CLASS_NAME");
    expect(skeleton).toContain("grid h-8");
    expect(skeleton).toContain('variant === "member" ? "h-[3.25rem]" : "h-10"');
    expect(skeleton).toContain("size-6 shrink-0 rounded-md");
    expect(skeleton).toContain('data-slot="kanban-root"');
    expect(skeleton).not.toContain("min-h-[28rem]");
  });

  it("pins skeleton density and spacing to the loaded page owners", () => {
    const skeleton = read("components/page-state/page-skeleton.tsx");
    const table = read("components/ui/table.tsx");
    const dashboard = read("app/[locale]/(protected)/dashboard/components/widgets-grid.tsx");
    const cardHeader = read("components/card/app-card-header.tsx");
    const cardBody = read("components/card/app-card-body.tsx");
    const detail = read("components/entity-detail/entity-detail-layout.tsx");
    const notes = read("components/entity-detail/entity-notes-panel.tsx");
    const editor = read("components/editor/editor.tsx");
    const activityPanel = read("features/messaging/activities/activities-panel.tsx");
    const activityRow = read("features/messaging/activities/activities-row.tsx");
    const inbox = read("app/[locale]/(protected)/inbox/page.tsx");
    const thread = read("app/[locale]/(protected)/inbox/components/thread-row.tsx");
    const message = read("app/[locale]/(protected)/inbox/components/message-item.tsx");
    const composer = read("app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx");

    expect(table).toContain("h-8 px-3");
    expect(table).toContain("px-3 py-2");
    expect(skeleton).toContain("grid h-8");
    expect(skeleton).toContain('variant === "member" ? "h-[3.25rem]" : "h-10"');

    expect(dashboard).toContain("margin={[16, 16]}");
    expect(dashboard).toContain("rowHeight={124}");
    expect(cardHeader).toContain("gap-4 p-6 pb-0");
    expect(cardBody).toContain("gap-4 p-6");
    expect(skeleton).toContain("h-[264px]");
    expect(skeleton).toContain("grid-cols-1 gap-4 md:grid-cols-2");

    expect(detail).toContain("@container/detail flex flex-col w-full flex-1 min-h-0 overflow-y-auto");
    expect(detail).toContain("px-4 pt-3 pb-1 shrink-0 min-h-8");
    expect(notes).toContain("px-4 pt-4 pb-1 shrink-0");
    expect(editor).toContain("relative min-h-52");
    expect(activityPanel).toContain("px-4 pt-4 pb-2");
    expect(activityPanel).toContain("overflow-auto px-2 pt-2 pb-4");
    expect(activityRow).toContain("items-start gap-3 rounded-md p-2");
    for (const token of ["min-h-8 pt-3", "min-h-52", "px-2 pt-2 pb-4", "rounded-md p-2"])
      expect(skeleton, token).toContain(token);

    expect(inbox).toContain("lg:grid-cols-[380px_1fr]");
    expect(thread).toContain("items-center gap-3 border-b border-border p-3");
    expect(message).toContain("flex gap-2 px-4 py-2");
    expect(composer).toContain("shrink-0 px-4 pt-2 pb-4");
    for (const token of [
      "lg:grid-cols-[380px_1fr]",
      "items-center gap-3 border-b p-3",
      "flex gap-2 px-4 py-2",
      "shrink-0 bg-background px-4 pt-2 pb-4",
    ])
      expect(skeleton, token).toContain(token);

    const settingsGeometry = read("components/page-state/page-state-geometry.ts");
    expect(settingsGeometry).toContain("grid-cols-1 gap-4 sm:grid-cols-");
    for (const settingsFile of [
      "app/[locale]/(protected)/profile/components/api-keys-card.tsx",
      "app/[locale]/(protected)/profile/components/connected-accounts-card.tsx",
    ])
      expect(read(settingsFile), settingsFile).toContain("SETTINGS_CARD_GRID_CLASS_NAME");
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

  it("uses the quiet true-empty treatment with neutral secondary actions", () => {
    const pageState = read("components/page-state/page-state.tsx");

    expect(pageState).toContain("h-[calc(100svh-10rem)]");
    expect(pageState).toContain("max-h-[34rem]");
    expect(pageState).toContain("max-w-sm");
    expect(pageState).toContain("before:bg-background/80");
    expect(pageState).not.toContain("rounded-xl border bg-background/95");
    expect(pageState).not.toContain("shadow-sm");

    const secondaryActionOwners = {
      "components/data-view/data-view-empty.tsx": '<Button size="sm" variant="secondary" onClick={() => onAdd?.()}>',
      "app/[locale]/(protected)/dashboard/components/widgets-grid.tsx":
        '<Button size="sm" variant="secondary" onClick={() => void widgetModalStore.add()}>',
      "app/[locale]/(protected)/profile/components/api-keys-card.tsx":
        '<Button size="sm" variant="secondary" onClick={() => void apiKeyModalStore.add()}>',
      "app/[locale]/(protected)/profile/components/connected-accounts-card.tsx":
        '<ConnectAction id="profile-connected-accounts-connect-empty" variant="secondary" />',
      "app/[locale]/(protected)/inbox/components/inbox-list.tsx": '<Button asChild size="sm" variant="secondary">',
    };

    for (const [file, expectedAction] of Object.entries(secondaryActionOwners)) {
      expect(read(file), file).toContain(expectedAction);
    }
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
