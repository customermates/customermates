import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SelectionOptionsSkeleton, SelectionValueSkeleton } from "../selection-loading";

describe("selection loading", () => {
  it("renders a reduced-motion-safe value placeholder without copy", () => {
    const html = renderToStaticMarkup(createElement(SelectionValueSkeleton));

    expect(html).toContain('data-selection-loading="value"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("motion-reduce:animate-none");
  });

  it("renders option-shaped rows under one accessible status", () => {
    const html = renderToStaticMarkup(createElement(SelectionOptionsSkeleton, { label: "Loading options" }));

    expect(html).toContain('data-selection-loading="options"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading options"');
    expect(html.match(/class="flex h-8 items-center/g)).toHaveLength(3);
  });
});
