import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertCircle, CheckCircle2, CircleArrowUp, Info, XCircle } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Alert, ALERT_ICONS } from "../alert";

describe("Alert", () => {
  it("exports the canonical product glyph for every alert variant", () => {
    expect(ALERT_ICONS).toEqual({
      destructive: XCircle,
      info: Info,
      neutral: Info,
      success: CheckCircle2,
      upsell: CircleArrowUp,
      warning: AlertCircle,
    });
  });

  it("gives every tinted variant its readable soft label and keeps the description off muted grey", () => {
    for (const [variant, label] of [
      ["success", "text-success-soft-foreground"],
      ["warning", "text-warning-soft-foreground"],
      ["destructive", "text-destructive-soft-foreground"],
    ] as const) {
      const markup = renderToStaticMarkup(createElement(Alert, { variant, title: "Title", description: "Body" }));

      expect(markup).toContain(label);
      expect(markup).toMatch(/class="[^"]*text-foreground\/80" data-slot="alert-description"/);
      expect(markup).not.toContain("text-muted-foreground");
    }
  });

  it("keeps info and every neutral surface grey, with no accent colour", () => {
    for (const variant of ["neutral", "info", "upsell"] as const) {
      const markup = renderToStaticMarkup(createElement(Alert, { variant, title: "Title", description: "Body" }));

      expect(markup).not.toMatch(/\b(?:bg|text|border)-(?:info|primary|mk-violet)/);
    }
  });

  it("draws every banner as the same grey strip, whatever the tone", () => {
    for (const variant of ["upsell", "warning", "destructive", "info"] as const) {
      const markup = renderToStaticMarkup(
        createElement(Alert, { variant, layout: "banner", title: "Paused", description: "Price" }),
      );

      expect(markup).toContain("bg-muted/60");
      expect(markup).not.toMatch(/bg-(?:warning|destructive|info)\//);
    }
  });

  it("renders the in-page banner layout and an action slot", () => {
    const markup = renderToStaticMarkup(
      createElement(Alert, {
        variant: "upsell",
        layout: "banner",
        description: "Paused",
        action: createElement("a", { href: "/x" }, "Go"),
      }),
    );

    expect(markup).toContain('data-layout="banner"');
    expect(markup).toContain('data-variant="upsell"');
    expect(markup).toContain('data-slot="alert-action"><a href="/x">Go</a></div>');
  });

  it("keeps rich description fragments together in one paragraph", () => {
    const markup = renderToStaticMarkup(
      createElement(Alert, {
        description: createElement(
          Fragment,
          null,
          "Review ",
          createElement("a", { href: "/terms" }, "Terms"),
          " and ",
          createElement("a", { href: "/dpa" }, "DPA"),
          ".",
        ),
      }),
    );

    expect(markup).toMatch(
      /data-slot="alert-description"[^>]*><p>Review <a href="\/terms">Terms<\/a> and <a href="\/dpa">DPA<\/a>\.<\/p><\/div>/,
    );
  });

  it("wraps plain descriptions while keeping children in their own body slot", () => {
    const markup = renderToStaticMarkup(
      createElement(Alert, { description: "Plain description" }, createElement("button", { type: "button" }, "Act")),
    );

    expect(markup).toMatch(/data-slot="alert-description"[^>]*><p>Plain description<\/p><\/div>/);
    expect(markup).toContain('data-slot="alert-body"><button type="button">Act</button></div>');
  });
});
