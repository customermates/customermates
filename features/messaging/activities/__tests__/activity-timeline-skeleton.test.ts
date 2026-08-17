import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActivityTimelineSkeleton } from "../activity-timeline-skeleton";

describe("ActivityTimelineSkeleton", () => {
  it("animates its shapes while a timeline is loading", () => {
    const html = renderToStaticMarkup(createElement(ActivityTimelineSkeleton));

    expect(html).toContain("data-page-skeleton-loading");
    expect(html).not.toContain("data-page-skeleton-empty");
    expect(html).toContain("data-loading-shape");
    expect(html).toContain("data-skeleton-motion");
  });

  it("renders the same geometry without motion as a true-empty background", () => {
    const html = renderToStaticMarkup(createElement(ActivityTimelineSkeleton, { animated: false }));

    expect(html).toContain("data-page-skeleton-empty");
    expect(html).not.toContain("data-page-skeleton-loading");
    expect(html).not.toContain("data-loading-shape");
    expect(html).not.toContain("data-skeleton-motion");
  });

  it("keeps both variants structurally identical so the background does not shift", () => {
    const strip = (html: string) =>
      html
        .replace(/ data-page-skeleton-(loading|empty)="true"/g, "")
        .replace(/ data-loading-shape="true"/g, "")
        .replace(/ data-skeleton-breathe="true"/g, "")
        .replace(/ data-skeleton-motion="\d"/g, "");

    expect(strip(renderToStaticMarkup(createElement(ActivityTimelineSkeleton)))).toBe(
      strip(renderToStaticMarkup(createElement(ActivityTimelineSkeleton, { animated: false }))),
    );
  });

  it("hides itself from assistive technology", () => {
    expect(renderToStaticMarkup(createElement(ActivityTimelineSkeleton))).toContain('aria-hidden="true"');
  });
});
