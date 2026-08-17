import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrganizationsPageSkeleton } from "../organizations-page-skeleton";

describe("OrganizationsPageSkeleton", () => {
  it("owns animated entity-table geometry for the route fallback", () => {
    const html = renderToStaticMarkup(createElement(OrganizationsPageSkeleton));

    expect(html).toContain('data-organizations-page-skeleton="true"');
    expect(html).toContain('data-page-skeleton-loading="true"');
    expect(html).toContain('data-skeleton-view="table"');
    expect(html).toContain('data-skeleton-variant="entity"');
    expect(html).toContain('data-skeleton-scroll-owner="table"');
    expect(html).toContain("data-skeleton-motion");
    expect(html).toContain("data-skeleton-pagination");
  });

  it.each(["cards", "board"] as const)("matches the active %s view with text identity geometry", (view) => {
    const html = renderToStaticMarkup(createElement(OrganizationsPageSkeleton, { view }));

    expect(html).toContain(`data-skeleton-view="${view}"`);
    expect(html).toContain('data-skeleton-variant="text"');
    expect(html).toContain(`data-skeleton-scroll-owner="${view}"`);
    expect(html).not.toContain("size-6 shrink-0 rounded-md");
  });

  it("reuses identical surfaces as a static, motionless empty background", () => {
    const loading = renderToStaticMarkup(createElement(OrganizationsPageSkeleton, { view: "cards" }));
    const empty = renderToStaticMarkup(
      createElement(OrganizationsPageSkeleton, {
        animated: false,
        view: "cards",
      }),
    );
    const surfaceClasses = /(?:rounded-xl bg-card[^"]*|data-skeleton-scroll-owner="[^"]+")/g;

    expect(empty).toContain('data-page-skeleton-empty="true"');
    expect(empty).not.toContain("data-skeleton-motion");
    expect(empty).not.toContain("data-skeleton-breathe");
    expect(loading.match(surfaceClasses)).toEqual(empty.match(surfaceClasses));
  });
});
