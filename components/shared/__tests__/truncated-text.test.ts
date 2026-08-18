import type { FunctionComponent } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TruncatedText } from "../truncated-text";

const Truncated = TruncatedText as FunctionComponent<{ className?: string }>;

describe("TruncatedText", () => {
  it("lets the text fill the flex container so caller alignment applies", () => {
    const markup = renderToStaticMarkup(createElement(Truncated, { className: "text-right" }, "€36,000.00"));

    expect(markup).toContain("text-right");
    expect(markup).toMatch(/class="[^"]*truncate[^"]*flex-1[^"]*"/);
  });

  it("keeps the text able to shrink below its content width", () => {
    const markup = renderToStaticMarkup(createElement(Truncated, {}, "€36,000.00"));

    expect(markup).toMatch(/class="[^"]*min-w-0[^"]*"/);
    expect(markup).toContain("€36,000.00");
  });
});
