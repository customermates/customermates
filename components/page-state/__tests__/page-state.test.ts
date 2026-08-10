import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PageSkeletonSpec } from "../page-skeleton";

import { PageSkeleton } from "../page-skeleton";
import { PageState } from "../page-state";

const ARCHETYPES: PageSkeletonSpec[] = [
  { kind: "data-view", view: "table" },
  { kind: "data-view", view: "cards" },
  { kind: "data-view", view: "board" },
  { kind: "dashboard" },
  { kind: "detail" },
  { kind: "settings" },
  { kind: "settings", view: "centered-card" },
  { kind: "inbox" },
];

describe("page state composition", () => {
  it("renders accessible, reduced-motion loading geometry without an action", () => {
    const html = renderToStaticMarkup(
      createElement(PageState, {
        label: "Loading page",
        skeleton: { kind: "data-view", view: "table" },
        state: "loading",
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Loading page");
    expect(html).toContain("size-full min-h-0 flex-1");
    expect(html).toContain("animate-pulse");
    expect(html).toContain("motion-reduce:animate-none");
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

    expect(shapes.length).toBeGreaterThan(0);
    expect(shapes.length).toBeLessThanOrEqual(64);
    expect(html).toContain(`data-skeleton-kind="${spec.kind}"`);
    expect(html).not.toMatch(/Acme|John Doe|Revenue|\$\d/);
  });
});
