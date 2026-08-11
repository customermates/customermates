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
    expect(genericFallback).toContain("animate-page-loading-in");
    expect(genericFallback).toContain("opacity-70");
    expect(genericFallback).not.toMatch(/PageState|PageSkeleton|<main|<button|\bfixed\b/);
    expect(read("components/ui/spinner.tsx")).toContain("motion-reduce:animate-none");

    const routeLoading = read("components/page-state/route-loading.tsx");
    expect(routeLoading).toContain('skeleton.kind === "detail"');
    expect(routeLoading).toContain('centered ? "h-full flex-1"');
    const pageSkeleton = read("components/page-state/page-skeleton.tsx");
    expect(pageSkeleton).toContain("@container/detail flex h-full min-h-0");
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

    expect(detail).toContain(
      "@container/detail animate-page-result-in flex min-h-0 w-full flex-1 flex-col overflow-y-auto",
    );
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
    expect(styles).toContain("--placeholder: #e6e6ea");
    expect(styles).toContain("--placeholder: #222228");
    for (const file of ["components/marketing/browser-frame.tsx", "components/shared/theme-switcher.tsx"]) {
      const source = read(file);
      expect(source, file).toContain("bg-placeholder");
      expect(source, file).toContain("motion-reduce:animate-none");
    }
  });

  it("constructs then pulses page placeholders without moving surfaces", () => {
    const skeleton = read("components/page-state/page-skeleton.tsx");
    const styles = read("styles/globals.css");
    const compactStyles = styles.replace(/\s+/g, " ");
    const widgets = read("app/[locale]/(protected)/dashboard/components/widgets-grid.tsx");
    const pulseStart = styles.indexOf("@keyframes page-skeleton-pulse");
    const pulseEnd = styles.indexOf("[data-page-skeleton-loading]", pulseStart);
    const pulse = styles.slice(pulseStart, pulseEnd);
    const emptyStart = styles.indexOf("[data-page-skeleton-empty]");
    const emptyEnd = styles.indexOf("@media (prefers-reduced-motion: reduce)", emptyStart);
    const empty = styles.slice(emptyStart, emptyEnd);

    expect(skeleton).toContain("data-page-skeleton-loading");
    expect(skeleton).toContain("data-page-skeleton-empty");
    expect(skeleton).toContain("data-skeleton-motion");
    expect(skeleton).toContain("data-skeleton-breathe");
    expect(skeleton).toContain("data-skeleton-shape");
    expect(skeleton).toContain("data-skeleton-group");
    expect(skeleton).not.toContain("animate-pulse");
    expect(compactStyles).toContain("page-skeleton-build 340ms cubic-bezier(0.22, 1, 0.36, 1)");
    expect(compactStyles).toContain("calc(var(--skeleton-group-delay) + var(--skeleton-shape-delay)) backwards");
    expect(compactStyles).toContain("page-skeleton-pulse 1.6s ease-in-out");
    expect(styles).toContain("[data-page-skeleton-loading] [data-skeleton-breathe]");
    expect(styles).toContain("--skeleton-group-delay: 0ms");
    expect(styles).toContain("--skeleton-shape-delay: 0ms");
    expect(compactStyles).toContain("calc(900ms + var(--skeleton-group-delay) + var(--skeleton-shape-delay)) infinite");
    for (const [group, delay] of [
      ["1", "60ms"],
      ["2", "120ms"],
      ["3", "180ms"],
    ]) {
      expect(styles).toContain(`[data-page-skeleton-loading] [data-skeleton-group="${group}"]`);
      expect(styles).toContain(`--skeleton-group-delay: ${delay}`);
    }
    for (const [phase, delay] of [
      ["1", "70ms"],
      ["2", "140ms"],
      ["3", "210ms"],
    ]) {
      expect(styles).toContain(`[data-page-skeleton-loading] [data-skeleton-motion="${phase}"]`);
      expect(styles).toContain(`--skeleton-shape-delay: ${delay}`);
    }
    expect(styles).toContain("opacity: 0.08");
    expect(styles).toContain("opacity: 0.62");
    expect(styles).toContain("transform: translateY(4px) scale(0.97)");
    expect(pulse).not.toMatch(/background|color|filter|width|height|shadow/);
    expect(empty).toContain("opacity: 0.62");
    expect(empty).not.toMatch(/animation|transform/);
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("animation: none");
    expect(compactStyles).toContain("--animate-page-empty-in: page-empty-in 300ms cubic-bezier(0.22, 1, 0.36, 1) both");
    expect(compactStyles).toContain(
      "--animate-page-result-in: page-result-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both",
    );
    expect(widgets.match(/animate-page-result-in/g)).toHaveLength(2);
    expect(widgets).toContain("useLayoutEffect");
    expect(widgets).toMatch(/useLayoutEffect\(\(\) => \{\s*widgetsStore\.setItems/);
    expect(read("components/page-state/page-state.tsx")).toContain("animate-page-empty-in pointer-events-none");
    expect(widgets).not.toMatch(/setTimeout|setInterval/);
  });

  it("ships no dashboard loading-preview delay", () => {
    const dashboard = read("app/[locale]/(protected)/dashboard/page.tsx");

    expect(dashboard).not.toMatch(/loadingPreview|DASHBOARD_LOADING_PREVIEW_MS|setTimeout|setInterval/);
  });

  it("settles resolved archetypes without delaying server data", () => {
    const resultOwners = [
      "components/data-view/data-view-container.tsx",
      "components/entity-detail/entity-detail-layout.tsx",
      "app/[locale]/(protected)/dashboard/components/widgets-grid.tsx",
      "app/[locale]/(protected)/inbox/components/inbox-list.tsx",
      "app/[locale]/(protected)/inbox/components/thread-panel.tsx",
      "app/[locale]/(protected)/profile/components/api-keys-card.tsx",
      "app/[locale]/(protected)/profile/components/connected-accounts-card.tsx",
      "app/[locale]/(protected)/profile/components/profile-settings-form.tsx",
      "app/[locale]/(protected)/company/components/company-settings/company-settings-form.tsx",
      "app/[locale]/(protected)/company/components/subscription/subscription-view.tsx",
      "app/[locale]/(protected)/legal-update/page.tsx",
      "app/[locale]/(protected)/onboarding/wizard/page.tsx",
      "app/[locale]/(protected)/subscription-expired/page.tsx",
    ];

    for (const file of resultOwners) {
      const source = read(file);
      expect(source, file).toContain("animate-page-result-in");
      expect(source, file).toContain("motion-reduce:animate-none");
    }

    const prepaintHydrationOwners = [
      "components/data-view/use-data-view-sync.ts",
      "app/[locale]/(protected)/dashboard/components/widgets-grid.tsx",
      "app/[locale]/(protected)/company/components/user/users-card.tsx",
      "app/[locale]/(protected)/company/components/role/roles-card.tsx",
      "app/[locale]/(protected)/profile/components/api-keys-card.tsx",
      "app/[locale]/(protected)/profile/components/connected-accounts-card.tsx",
      "app/[locale]/(protected)/inbox/components/thread-panel.tsx",
      "app/[locale]/(protected)/company/components/subscription/subscription-panel.tsx",
    ];

    for (const file of prepaintHydrationOwners) expect(read(file), file).toContain("useLayoutEffect");
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

  it("uses the quiet true-empty treatment across every archetype", () => {
    const pageState = read("components/page-state/page-state.tsx");

    expect(pageState).toContain("absolute inset-0");
    expect(pageState).toContain("items-center justify-center");
    expect(pageState).toContain("relative min-h-0 w-full flex-1 overflow-hidden");
    expect(pageState).not.toContain("max-h-[34rem]");
    expect(pageState).not.toContain("h-[calc(100svh-10rem)]");
    expect(pageState).toContain("max-w-sm");
    expect(pageState).toContain("before:bg-background/85 before:blur-xl");
    expect(pageState).toContain("animate-page-empty-in");
    expect(pageState).not.toContain("before:bg-background/80 before:blur-2xl");
    expect(pageState).not.toContain("opacity-45");
    expect(pageState).not.toContain("rounded-xl border bg-background/95");
    expect(pageState).not.toContain("shadow-sm");
    expect(read("app/[locale]/(protected)/dashboard/page.tsx")).toContain(
      "relative flex min-h-0 w-full flex-1 flex-col",
    );
  });

  it("keeps topbar actions primary and centered empty actions secondary", () => {
    const toolbar = read("components/data-view/data-view-toolbar.tsx");
    const container = read("components/data-view/data-view-container.tsx");

    expect(toolbar).toContain('variant="default"');
    expect(toolbar).not.toContain("deemphasizeAdd");
    expect(container).not.toContain("deemphasizeAdd");

    const primaryActionOwners = {
      "app/[locale]/(protected)/dashboard/components/widgets-grid.tsx": "dashboard-add-widget",
      "app/[locale]/(protected)/profile/components/api-keys-card.tsx": "profile-api-keys-generate",
      "app/[locale]/(protected)/inbox/components/inbox-list.tsx": "ConnectedAccountsCard.title",
    };

    for (const [file, marker] of Object.entries(primaryActionOwners)) {
      const source = read(file);
      const markerIndex = source.indexOf(marker);
      const action = source.slice(Math.max(0, markerIndex - 250), markerIndex + 450);

      expect(markerIndex, file).toBeGreaterThanOrEqual(0);
      expect(action, file).toContain('variant="default"');
      expect(action, file).not.toMatch(/variant=\{[^}]*secondary/);
    }

    const connectedAccounts = read("app/[locale]/(protected)/profile/components/connected-accounts-card.tsx");
    expect(connectedAccounts).toContain('<ConnectAction id="profile-connected-accounts-connect" />');

    const secondaryActionOwners = {
      "components/data-view/data-view-empty.tsx": "canCreate ? (",
      "app/[locale]/(protected)/dashboard/components/widgets-grid.tsx": "{isTrueEmpty && (",
      "app/[locale]/(protected)/profile/components/api-keys-card.tsx": "if (isTrueEmpty) {",
      "app/[locale]/(protected)/profile/components/connected-accounts-card.tsx":
        "profile-connected-accounts-connect-empty",
      "app/[locale]/(protected)/inbox/components/inbox-list.tsx": 'pageState === "true-empty"',
    };

    for (const [file, marker] of Object.entries(secondaryActionOwners)) {
      const source = read(file);
      const markerIndex = source.indexOf(marker);
      const action = source.slice(markerIndex, markerIndex + 1_200);

      expect(markerIndex, file).toBeGreaterThanOrEqual(0);
      expect(action, file).toContain('variant="secondary"');
    }
  });

  it("serializes the Inbox CTA permission before hydration", () => {
    const page = read("app/[locale]/(protected)/inbox/page.tsx");
    const list = read("app/[locale]/(protected)/inbox/components/inbox-list.tsx");

    expect(page).toContain("getUserService().hasPermission(Resource.inboxMessages, Action.create)");
    expect(page).toContain("canConnect={!locked && canConnect}");
    expect(list).toContain("canConnect: boolean");
    expect(list).not.toContain("userStore.can(Resource.inboxMessages, Action.create)");
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
