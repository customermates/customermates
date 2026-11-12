import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IncomingWebhooksPageSkeleton } from "../incoming-webhooks-page-skeleton";

describe("incoming webhooks page skeleton", () => {
  it("draws the page header and endpoint cards while loading", () => {
    const html = renderToStaticMarkup(createElement(IncomingWebhooksPageSkeleton));

    expect(html).toContain('data-incoming-webhooks-page-skeleton="true"');
    expect(html).toContain("data-page-skeleton-loading");
    expect(html).not.toContain("data-page-skeleton-empty");
    expect(html.match(/data-skeleton-group=/g)).toHaveLength(3);
  });

  it("keeps the empty background static", () => {
    const html = renderToStaticMarkup(createElement(IncomingWebhooksPageSkeleton, { animated: false }));

    expect(html).toContain('data-page-skeleton-empty="true"');
    expect(html).not.toContain("data-page-skeleton-loading");
    expect(html).not.toContain("animate-pulse");
  });
});
