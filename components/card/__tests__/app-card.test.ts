import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppCard } from "../app-card";
import { AppCardBody } from "../app-card-body";
import { AppCardFooter } from "../app-card-footer";
import { AppCardHeader } from "../app-card-header";

describe("AppCard", () => {
  it("uses one shared background across its header, body, and footer", () => {
    const markup = renderToStaticMarkup(
      createElement(
        AppCard,
        null,
        createElement(AppCardHeader, null, "Header"),
        createElement(AppCardBody, null, "Body"),
        createElement(AppCardFooter, null, "Footer"),
      ),
    );
    const root = markup.match(/^<div[^>]+>/)?.[0] ?? "";

    expect(root).toContain("bg-background");
    expect(root).not.toContain("bg-card");
    expect(root).toContain("text-foreground");
    expect(root).not.toContain("text-card-foreground");
    expect(markup.match(/bg-background/g)).toHaveLength(1);
    expect(markup).not.toMatch(/data-slot="card-(?:header|content|footer)"[^>]*\bbg-/);
    expect(markup).not.toMatch(/data-slot="card-(?:header|footer)"[^>]*\bborder-[tb]\b/);
  });

  it("still allows an intentional caller background override", () => {
    const markup = renderToStaticMarkup(createElement(AppCard, { className: "bg-transparent" }, "Content"));
    const root = markup.match(/^<div[^>]+>/)?.[0] ?? "";

    expect(root).toContain("bg-transparent");
    expect(root).not.toContain("bg-background");
  });
});
