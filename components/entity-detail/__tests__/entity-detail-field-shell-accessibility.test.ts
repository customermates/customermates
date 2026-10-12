import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { field?: string }) =>
    key === "Common.ariaLabels.explainField" ? `About ${values?.field ?? "field"}` : key,
}));

vi.mock("../entity-detail-field-actions", () => ({
  EntityDetailFieldActions: ({ fieldId, label }: { fieldId: string; label: string }) =>
    createElement("button", {
      "aria-label": `Pin ${label}`,
      "data-pin-field": fieldId,
      type: "button",
    }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", { "data-slot": "tooltip" }, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-trigger" }, children),
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-content" }, children),
}));

import { EntityDetailFieldShell } from "../entity-detail-field-shell";

function renderField(value: ReactNode, help?: ReactNode) {
  return renderToStaticMarkup(
    createElement(EntityDetailFieldShell, {
      fieldId: "totalValue",
      help,
      label: "Deal value",
      value,
    }),
  );
}

describe("EntityDetailFieldShell", () => {
  it("shows the value in the bordered input box with the derivation control at its end and no source line", () => {
    const markup = renderToStaticMarkup(
      createElement(EntityDetailFieldShell, {
        fieldId: "totalValue",
        label: "Deal value",
        value: "€12,500",
        derivation: createElement("button", { "aria-label": "How Deal value is calculated", type: "button" }),
      }),
    );
    const output = markup.match(/<div[^>]*data-field-state="read-only"[^>]*>/)?.[0] ?? "";

    expect(output).toContain("border-input");
    expect(output).toContain("bg-input-background");
    expect(output).toContain("min-h-9");
    expect(output).toContain("px-3");
    expect(output).toContain("pr-9");
    expect(output).not.toContain("border-transparent");
    expect(output).not.toContain("bg-transparent");
    expect(markup).toContain("select-text");
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<p");
    expect(markup.indexOf('data-field-state="read-only"')).toBeLessThan(markup.indexOf("data-form-control-end"));
    expect(markup).toContain('aria-label="How Deal value is calculated"');
  });

  it("marks a permission-restricted value as locked without a tooltip or derivation control", () => {
    const markup = renderToStaticMarkup(
      createElement(EntityDetailFieldShell, {
        fieldId: "totalValue",
        label: "Deal value",
        value: null,
        locked: true,
      }),
    );

    expect(markup).toContain('class="w-full min-w-0 cursor-not-allowed" data-field-locked=""');
    expect(markup).not.toContain('data-slot="tooltip');
    expect(markup).not.toContain("data-form-control-end");
    expect(markup).not.toContain("pr-9");
  });

  it("associates its read-only output with the visible label and keeps help and pin actions named", () => {
    const markup = renderField("€12,500", "Calculated from linked services.");

    const labelId = markup.match(/<label[^>]*id="([^"]+)"/)?.[1];
    const labelledBy = markup.match(/aria-labelledby="([^"]+)"/)?.[1];

    expect(labelId).toBeDefined();
    expect(labelledBy).toBe(labelId);
    expect(markup).toContain("Deal value</label>");
    expect(markup).toContain('role="textbox"');
    expect(markup).toContain('aria-readonly="true"');
    expect(markup).toContain('data-field-state="read-only"');
    expect(markup).toContain('aria-label="About Deal value"');
    expect(markup).toContain('aria-label="Pin Deal value"');
    expect(markup).toContain('data-pin-field="totalValue"');
    expect(markup).toContain("Calculated from linked services.");
    expect(markup).toContain("€12,500");

    const labelPosition = markup.indexOf("<label");
    const helpPosition = markup.indexOf('aria-label="About Deal value"');
    const pinPosition = markup.indexOf('aria-label="Pin Deal value"');
    const outputPosition = markup.indexOf('data-field-state="read-only"');
    expect(labelPosition).toBeLessThan(helpPosition);
    expect(helpPosition).toBeLessThan(pinPosition);
    expect(pinPosition).toBeLessThan(outputPosition);
  });

  it.each([null, undefined, ""])("renders the shared empty value for %s", (value) => {
    const markup = renderField(value);

    expect(markup).toContain('data-empty-value=""');
    expect(markup).not.toContain("—");
  });

  it("preserves zero as a meaningful value", () => {
    const markup = renderField(0);

    expect(markup).toContain(">0</span>");
    expect(markup).not.toContain("data-empty-value");
  });

  it("omits the help action when no explanation is supplied", () => {
    const markup = renderField("€12,500");

    expect(markup).not.toContain("About Deal value");
    expect(markup).not.toContain('data-slot="tooltip-content"');
    expect(markup).toContain('aria-label="Pin Deal value"');
  });
});
