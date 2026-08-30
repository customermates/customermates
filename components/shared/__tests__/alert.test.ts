import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Alert, ALERT_ICONS } from "../alert";

describe("Alert", () => {
  it("exports the canonical product glyph for every alert color", () => {
    expect(ALERT_ICONS).toEqual({
      danger: XCircle,
      default: Info,
      primary: Info,
      success: CheckCircle2,
      warning: AlertCircle,
    });
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

  it("wraps plain descriptions while keeping children in their separate grid cell", () => {
    const markup = renderToStaticMarkup(
      createElement(Alert, { description: "Plain description" }, createElement("button", { type: "button" }, "Act")),
    );

    expect(markup).toMatch(/data-slot="alert-description"[^>]*><p>Plain description<\/p><\/div>/);
    expect(markup).toContain('<div class="col-start-2 min-w-0"><button type="button">Act</button></div>');
  });
});
