import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "../button";
import { Input } from "../input";
import { Select, SelectTrigger } from "../select";
import { Textarea } from "../textarea";

function expectNativeReadOnlyTreatment(markup: string) {
  expect(markup.toLowerCase()).toContain('readonly=""');
  expect(markup).toContain("read-only:cursor-text");
  expect(markup).toContain("read-only:border-border");
  expect(markup).toContain("read-only:bg-background");
  expect(markup).toContain("read-only:shadow-none");
  expect(markup).toContain("read-only:focus-visible:ring-[2px]");
  expect(markup).toContain("read-only:focus-visible:ring-ring/30");
}

function expectNativeDisabledTreatment(markup: string) {
  expect(markup).toContain('disabled=""');
  expect(markup).toContain("disabled:cursor-not-allowed");
  expect(markup).toContain("disabled:border-border");
  expect(markup).toContain("disabled:bg-background");
  expect(markup).toContain("disabled:text-muted-foreground");
  expect(markup).toContain("disabled:shadow-none");
  expect(markup).toContain("disabled:opacity-100");
  expect(markup).not.toContain("disabled:opacity-50");
}

function expectFieldReadOnlyTreatment(markup: string) {
  expect(markup).toContain('aria-readonly="true"');
  expect(markup).toContain("aria-[readonly=true]:cursor-default");
  expect(markup).toContain("aria-[readonly=true]:border-border");
  expect(markup).toContain("aria-[readonly=true]:bg-background");
  expect(markup).toContain("aria-[readonly=true]:text-foreground");
  expect(markup).toContain("aria-[readonly=true]:shadow-none");
  expect(markup).toContain("aria-[readonly=true]:active:scale-100");
}

function expectFieldDisabledTreatment(markup: string) {
  expect(markup).toContain('disabled=""');
  expect(markup).toContain("disabled:border-border");
  expect(markup).toContain("disabled:bg-background");
  expect(markup).toContain("disabled:text-muted-foreground");
  expect(markup).toContain("disabled:shadow-none");
  expect(markup).toContain("disabled:opacity-100");
  expect(markup).toContain("disabled:active:scale-100");
  expect(markup).not.toContain("disabled:opacity-50");
}

describe("native read-only field controls", () => {
  it("keeps a read-only input selectable and visually recessed", () => {
    const markup = renderToStaticMarkup(
      createElement(Input, { "aria-label": "Deal value", readOnly: true, value: "€12,500" }),
    );

    expect(markup).toContain('aria-label="Deal value"');
    expectNativeReadOnlyTreatment(markup);
  });

  it("keeps a read-only textarea selectable and visually recessed", () => {
    const markup = renderToStaticMarkup(
      createElement(Textarea, { "aria-label": "Notes", readOnly: true, value: "Calculated notes" }),
    );

    expect(markup).toContain('aria-label="Notes"');
    expectNativeReadOnlyTreatment(markup);
  });

  it("uses the recessed treatment without fading disabled inputs and textareas", () => {
    const input = renderToStaticMarkup(createElement(Input, { "aria-label": "Disabled input", disabled: true }));
    const textarea = renderToStaticMarkup(
      createElement(Textarea, { "aria-label": "Disabled textarea", disabled: true }),
    );

    expectNativeDisabledTreatment(input);
    expectNativeDisabledTreatment(textarea);
  });
});

describe("field-style button controls", () => {
  it("keeps an aria-read-only field button focusable and visually recessed", () => {
    const markup = renderToStaticMarkup(
      createElement(Button, { "aria-readonly": true, variant: "field" }, "Calculated selection"),
    );

    expect(markup).toContain('type="button"');
    expect(markup).not.toContain('disabled=""');
    expectFieldReadOnlyTreatment(markup);
  });

  it("uses the recessed treatment without fading a disabled field button", () => {
    const markup = renderToStaticMarkup(createElement(Button, { disabled: true, variant: "field" }, "Unavailable"));

    expectFieldDisabledTreatment(markup);
  });
});

describe("SelectTrigger", () => {
  it("keeps an aria-read-only combobox focusable and visually recessed", () => {
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

  it("uses the recessed treatment without fading a disabled combobox", () => {
    const markup = renderToStaticMarkup(
      createElement(Select, { disabled: true }, createElement(SelectTrigger, { "aria-label": "Stage" }, "Qualified")),
    );

    expect(markup).toContain('role="combobox"');
    expectFieldDisabledTreatment(markup);
  });
});
