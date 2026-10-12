import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "../button";
import { Input } from "../input";
import { Select, SelectTrigger } from "../select";
import { Textarea } from "../textarea";

const UNIFORM_SURFACE = ["border-input", "bg-input-background", "shadow-xs"];
const STATE_SURFACE =
  /(?:read-only|disabled|aria-\[readonly=true\]):(?:border-border|bg-background|text-muted-foreground|shadow-none|opacity-50)/;

function expectUniformSurface(markup: string) {
  for (const token of UNIFORM_SURFACE) expect(markup).toContain(token);
  expect(markup).not.toMatch(STATE_SURFACE);
}

function expectNativeReadOnlyTreatment(markup: string) {
  expect(markup.toLowerCase()).toContain('readonly=""');
  expect(markup).toContain("read-only:cursor-[inherit]");
  expect(markup).toContain("read-only:focus-visible:ring-[2px]");
  expect(markup).toContain("read-only:focus-visible:ring-ring/30");
  expectUniformSurface(markup);
}

function expectNativeDisabledTreatment(markup: string) {
  expect(markup).toContain('disabled=""');
  expect(markup).toContain("disabled:cursor-not-allowed");
  expect(markup).toContain("disabled:opacity-100");
  expectUniformSurface(markup);
}

function expectFieldReadOnlyTreatment(markup: string) {
  expect(markup).toContain('aria-readonly="true"');
  expect(markup).toContain("aria-[readonly=true]:cursor-[inherit]");
  expect(markup).toContain("aria-[readonly=true]:hover:bg-input-background");
  expect(markup).toContain("aria-[readonly=true]:active:scale-100");
  expectUniformSurface(markup);
}

function expectFieldDisabledTreatment(markup: string) {
  expect(markup).toContain('disabled=""');
  expect(markup).toContain("disabled:cursor-not-allowed");
  expect(markup).toContain("disabled:hover:bg-input-background");
  expect(markup).toContain("disabled:opacity-100");
  expect(markup).toContain("disabled:active:scale-100");
  expectUniformSurface(markup);
}

describe("native read-only field controls", () => {
  it("keeps a read-only input selectable and on the shared field surface", () => {
    const markup = renderToStaticMarkup(
      createElement(Input, { "aria-label": "Deal value", readOnly: true, value: "€12,500" }),
    );

    expect(markup).toContain('aria-label="Deal value"');
    expectNativeReadOnlyTreatment(markup);
  });

  it("keeps a read-only textarea selectable and on the shared field surface", () => {
    const markup = renderToStaticMarkup(
      createElement(Textarea, { "aria-label": "Notes", readOnly: true, value: "Calculated notes" }),
    );

    expect(markup).toContain('aria-label="Notes"');
    expectNativeReadOnlyTreatment(markup);
  });

  it("keeps the shared field surface on disabled inputs and textareas", () => {
    const input = renderToStaticMarkup(createElement(Input, { "aria-label": "Disabled input", disabled: true }));
    const textarea = renderToStaticMarkup(
      createElement(Textarea, { "aria-label": "Disabled textarea", disabled: true }),
    );

    expectNativeDisabledTreatment(input);
    expectNativeDisabledTreatment(textarea);
  });
});

describe("field-style button controls", () => {
  it("keeps an aria-read-only field button focusable and on the shared field surface", () => {
    const markup = renderToStaticMarkup(
      createElement(Button, { "aria-readonly": true, variant: "field" }, "Calculated selection"),
    );

    expect(markup).toContain('type="button"');
    expect(markup).not.toContain('disabled=""');
    expectFieldReadOnlyTreatment(markup);
  });

  it("keeps the shared field surface on a disabled field button", () => {
    const markup = renderToStaticMarkup(createElement(Button, { disabled: true, variant: "field" }, "Unavailable"));

    expectFieldDisabledTreatment(markup);
  });
});

describe("SelectTrigger", () => {
  it("keeps an aria-read-only combobox focusable and on the shared field surface", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Select,
        null,
        createElement(SelectTrigger, { "aria-label": "Stage", "aria-readonly": true }, "Qualified"),
      ),
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-label="Stage"');
    expect(markup).not.toContain('disabled=""');
    expectFieldReadOnlyTreatment(markup);
  });

  it("keeps the shared field surface on a disabled combobox", () => {
    const markup = renderToStaticMarkup(
      createElement(Select, { disabled: true }, createElement(SelectTrigger, { "aria-label": "Stage" }, "Qualified")),
    );

    expect(markup).toContain('role="combobox"');
    expectFieldDisabledTreatment(markup);
  });
});
