import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PageSkeletonSpec } from "../page-skeleton";

import {
  DATA_CARD_GRID_CLASS_NAME,
  DATA_KANBAN_COLUMN_CLASS_NAME,
  DATA_KANBAN_TRACK_CLASS_NAME,
} from "@/components/data-view/data-view-geometry";
import { GenericPageLoading } from "../generic-page-loading";
import { SETTINGS_CARD_GRID_CLASS_NAME } from "../page-state-geometry";
import { PageSkeleton } from "../page-skeleton";
import { PageState } from "../page-state";

const ARCHETYPES: PageSkeletonSpec[] = [
  { kind: "data-view", tableVariant: "contact", view: "table" },
  { kind: "data-view", tableVariant: "entity", view: "table" },
  { kind: "data-view", tableVariant: "member", view: "table" },
  { kind: "data-view", tableVariant: "plain", view: "table" },
  { identity: "avatar", kind: "data-view", view: "cards" },
  { identity: "text", kind: "data-view", view: "cards" },
  { identity: "avatar", kind: "data-view", view: "board" },
  { identity: "text", kind: "data-view", view: "board" },
  { kind: "dashboard" },
  { kind: "detail" },
  { kind: "settings" },
  { card: "api-keys", kind: "settings", view: "cards" },
  { card: "connected-accounts", kind: "settings", view: "cards" },
  { kind: "settings", view: "centered-card" },
  { kind: "settings", view: "centered-card", maxWidth: "3xl" },
  { kind: "inbox" },
  { kind: "inbox", view: "list" },
  { kind: "inbox", view: "transcript" },
];

describe("page state composition", () => {
  it("renders accessible, reduced-motion loading geometry without an action", () => {
    const html = renderToStaticMarkup(
      createElement(PageState, {
        label: "Loading page",
        skeleton: { kind: "data-view", tableVariant: "contact", view: "table" },
        state: "loading",
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toMatch(/role="status">Loading page<\/span><div aria-busy="true"/);
    expect(html).toContain("Loading page");
    expect(html).toContain("size-full min-h-0 flex-1");
    expect(html).toContain("animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).not.toContain('aria-live="polite"');
    expect(html).not.toContain("<button");
  });

  it("keeps true-empty geometry static, hidden, inert, and action-aware", () => {
    const html = renderToStaticMarkup(
      createElement(PageState, {
        action: createElement("button", null, "Authorized action"),
        description: "Empty description",
        skeleton: { kind: "dashboard" },
        state: "empty",
        title: "Empty title",
      }),
    );

    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain("animate-pulse");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("pointer-events-none");
    expect(html).toContain("data-page-state-background");
    expect(html).toContain("data-page-state-action");
    expect(html).not.toContain("pointer-events-none absolute inset-0 opacity-45");
    expect(html).toContain("Authorized action");
    expect(html).toContain("Empty title");
    expect(html).toContain("Empty description");
  });

  it("omits an unauthorized empty action", () => {
    const html = renderToStaticMarkup(
      createElement(PageState, {
        skeleton: { kind: "settings" },
        state: "empty",
        title: "Empty title",
      }),
    );

    expect(html).not.toContain("data-page-state-action");
    expect(html).not.toContain("<button");
  });

  it("renders an explicit alert state with retry content", () => {
    const html = renderToStaticMarkup(
      createElement(PageState, {
        action: createElement("button", null, "Retry"),
        description: "Try again later",
        state: "error",
        title: "Could not load",
      }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load");
    expect(html).toContain("Retry");
    expect(html).not.toContain('data-slot="skeleton"');
  });

  it.each(ARCHETYPES)("bounds the $kind skeleton composition", (spec) => {
    const html = renderToStaticMarkup(createElement(PageSkeleton, { spec }));
    const shapes = html.match(/data-slot="skeleton"/g) ?? [];
    const animations = html.match(/animate-pulse/g) ?? [];

    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes.length).toBeLessThanOrEqual(128);
    expect(animations).toHaveLength(1);
    expect(html).toContain(`data-skeleton-kind="${spec.kind}"`);
    expect(html).not.toMatch(/Acme|John Doe|Revenue|\$\d/);
  });

  it.each(ARCHETYPES)("keeps the static $kind skeleton motionless", (spec) => {
    const html = renderToStaticMarkup(createElement(PageSkeleton, { animated: false, spec }));

    expect(html).not.toContain("animate-pulse");
  });

  it("renders one neutral generic status without fabricated page geometry", () => {
    const html = renderToStaticMarkup(createElement(GenericPageLoading, { label: "Loading page" }));

    expect(html).toContain('data-page-loading="generic"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading page"');
    expect(html).toContain("flex min-h-0 w-full flex-1 items-center justify-center");
    expect(html).toContain("motion-reduce:animate-none");
    expect(html).not.toContain("data-skeleton-kind");
    expect(html).not.toContain("<main");
    expect(html).not.toContain("<button");
  });

  it("matches table density and preserves the pagination rail", () => {
    const html = renderToStaticMarkup(
      createElement(PageSkeleton, {
        spec: { kind: "data-view", tableVariant: "contact", view: "table" },
      }),
    );

    expect(html).toContain('data-skeleton-scroll-owner="table"');
    expect(html).toContain("grid h-8");
    expect(html).toContain("h-10");
    expect(html).toContain("gap-2 px-3");
    expect(html).toContain("size-6 shrink-0 rounded-md");
    expect(html).toContain("data-skeleton-pagination");
    expect(html).not.toContain("min-h-14 flex-1");
    expect(html).not.toContain("overflow-hidden rounded-lg border bg-card");
  });

  it("keeps selection and identity geometry specific to each table owner", () => {
    const contact = renderToStaticMarkup(
      createElement(PageSkeleton, {
        spec: { kind: "data-view", tableVariant: "contact", view: "table" },
      }),
    );
    const entity = renderToStaticMarkup(
      createElement(PageSkeleton, {
        spec: { kind: "data-view", tableVariant: "entity", view: "table" },
      }),
    );
    const member = renderToStaticMarkup(
      createElement(PageSkeleton, {
        spec: { kind: "data-view", tableVariant: "member", view: "table" },
      }),
    );
    const plain = renderToStaticMarkup(
      createElement(PageSkeleton, {
        spec: { kind: "data-view", tableVariant: "plain", view: "table" },
      }),
    );

    expect(contact).toContain('data-skeleton-variant="contact"');
    expect(contact).toContain("grid-cols-[2.5rem_minmax(12rem,2fr)");
    expect(contact).toContain("size-6 shrink-0 rounded-md");
    expect(entity).toContain('data-skeleton-variant="entity"');
    expect(entity).toContain("grid-cols-[2.5rem_minmax(12rem,2fr)");
    expect(entity).not.toContain("size-6 shrink-0 rounded-md");
    expect(member).toContain('data-skeleton-variant="member"');
    expect(member).toContain("h-[3.25rem]");
    expect(member).not.toContain("grid-cols-[2.5rem_");
    expect(plain).toContain('data-skeleton-variant="plain"');
    expect(plain).not.toContain("grid-cols-[2.5rem_");
    expect(plain).not.toContain("size-6 shrink-0 rounded-md");
  });

  it("shares loaded card and Kanban tracks with their skeletons", () => {
    const cards = renderToStaticMarkup(
      createElement(PageSkeleton, {
        spec: { identity: "avatar", kind: "data-view", view: "cards" },
      }),
    );
    const board = renderToStaticMarkup(
      createElement(PageSkeleton, {
        spec: { identity: "text", kind: "data-view", view: "board" },
      }),
    );

    expect(cards).toContain(DATA_CARD_GRID_CLASS_NAME);
    expect(cards).toContain("rounded-xl bg-card py-4 shadow-xs");
    expect(cards).not.toContain("auto-rows-fr");
    expect(board).toContain(DATA_KANBAN_TRACK_CLASS_NAME);
    expect(board).toContain(DATA_KANBAN_COLUMN_CLASS_NAME);
    expect(board).toContain("rounded-xl bg-card py-3 shadow-xs");
    expect(board).not.toContain("bg-muted/50 p-3");
  });

  it("matches dashboard and detail panel spacing", () => {
    const dashboard = renderToStaticMarkup(createElement(PageSkeleton, { spec: { kind: "dashboard" } }));
    const detail = renderToStaticMarkup(createElement(PageSkeleton, { spec: { kind: "detail" } }));

    expect(dashboard).toContain("h-[264px]");
    expect(dashboard).toContain("p-6 pb-0");
    expect(dashboard).toContain("gap-4 md:grid-cols-2");
    expect(dashboard).not.toContain("md:gap-6");
    expect(detail).toContain("contain-[layout]");
    expect(detail).toContain("min-h-8 pt-3");
    expect(detail).toContain("p-4 pt-2");
    expect(detail).toContain("px-2 pt-2 pb-4");
    expect(detail).toContain("min-h-52");
    expect(detail).toContain("size-8 shrink-0 rounded-lg");
    expect(detail).not.toContain("grid-cols-1 gap-px overflow-hidden bg-border");
  });

  it("keeps settings and inbox variants faithful to their loaded surfaces", () => {
    const form = renderToStaticMarkup(createElement(PageSkeleton, { spec: { kind: "settings" } }));
    const settingsCards = renderToStaticMarkup(
      createElement(PageSkeleton, {
        spec: { card: "connected-accounts", kind: "settings", view: "cards" },
      }),
    );
    const centered = renderToStaticMarkup(
      createElement(PageSkeleton, {
        spec: { kind: "settings", view: "centered-card", maxWidth: "3xl" },
      }),
    );
    const inbox = renderToStaticMarkup(createElement(PageSkeleton, { spec: { kind: "inbox" } }));

    expect(form).toContain("max-w-3xl flex-col gap-6");
    expect(form).toContain("space-y-1.5");
    expect(form).toContain("h-9 w-full rounded-md");
    expect(settingsCards).toContain(SETTINGS_CARD_GRID_CLASS_NAME);
    expect(settingsCards).toContain("rounded-xl bg-card py-4 shadow-xs");
    expect(settingsCards).toContain('data-skeleton-variant="connected-accounts"');
    expect(settingsCards).toContain("size-4 shrink-0 rounded");
    expect(settingsCards).not.toContain("size-6 shrink-0 rounded-md");
    expect(centered).toContain("min-h-full w-full items-center justify-center p-4");
    expect(centered).toContain("max-w-3xl");
    expect(inbox).toContain("lg:grid-cols-[380px_1fr]");
    expect(inbox).toContain("lg:border-r lg:border-border");
    expect(inbox).toContain("min-h-16 items-center gap-3 border-b p-3");
    expect(inbox).toContain("flex gap-2 px-4 py-2");
    expect(inbox).toContain("shrink-0 bg-background px-4 pt-2 pb-4");
    expect(inbox).not.toContain("overflow-hidden rounded-lg border bg-card");
  });
});
