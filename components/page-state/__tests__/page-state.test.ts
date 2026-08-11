import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

import { PageState } from "../page-state";

function background() {
  return createElement("div", { "data-test-background": true, "data-page-skeleton-loading": true });
}

describe("PageState", () => {
  it("renders one accessible loading status around an inert composed background", () => {
    const html = renderToStaticMarkup(
      createElement(PageState, { background: background(), label: "Loading", state: "loading" }),
    );
    expect(html).toContain('data-page-state="loading"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-page-state-background="true"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-test-background="true"');
    expect(html).not.toContain("button");
  });

  it("renders static empty geometry behind one centered authorized action", () => {
    const onClick = vi.fn();
    const html = renderToStaticMarkup(
      createElement(PageState, {
        action: createElement(Button, { onClick }, "Add"),
        background: createElement("div", { "data-page-skeleton-empty": true }),
        description: "Create the first item",
        state: "empty",
        title: "Nothing here",
      }),
    );
    expect(html).toContain('data-page-state="empty"');
    expect(html).toContain('data-page-state-overlay="true"');
    expect(html).toContain('data-page-state-content="true"');
    expect(html).toContain('data-page-state-action="true"');
    expect(html).toContain('data-page-skeleton-empty="true"');
    expect(html).toContain("Nothing here");
    expect(html).toContain("Create the first item");
    expect(html).toContain("Add");
    expect(html).not.toContain('role="alert"');
  });

  it("omits the empty action when the owner does not authorize one", () => {
    const html = renderToStaticMarkup(
      createElement(PageState, {
        background: createElement("div"),
        state: "empty",
        title: "Nothing here",
      }),
    );
    expect(html).not.toContain("data-page-state-action");
    expect(html).not.toContain("button");
  });

  it("renders an explicit alert with an optional retry action", () => {
    const html = renderToStaticMarkup(
      createElement(PageState, {
        action: createElement(Button, null, "Retry"),
        description: "Try again",
        state: "error",
        title: "Could not load",
      }),
    );
    expect(html).toContain('data-page-state="error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load");
    expect(html).toContain("Try again");
    expect(html).toContain("Retry");
    expect(html).not.toContain("data-page-state-background");
  });
});
