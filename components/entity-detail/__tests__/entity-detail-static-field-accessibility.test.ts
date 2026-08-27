import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { field?: string }) =>
    key === "Common.ariaLabels.explainField" ? `About ${values?.field ?? "field"}` : key,
}));

vi.mock("../entity-detail-pin-button", () => ({
  EntityDetailPinButton: ({ fieldId, label }: { fieldId: string; label: string }) =>
    createElement("button", { "aria-label": `Pin ${label}`, "data-pin-field": fieldId, type: "button" }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", { "data-slot": "tooltip" }, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-trigger" }, children),
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-content" }, children),
}));

import { EntityDetailStaticField } from "../entity-detail-static-field";

function renderField(value: ReactNode, help?: ReactNode) {
  return renderToStaticMarkup(
    createElement(EntityDetailStaticField, {
      fieldId: "totalValue",
      help,
      label: "Deal value",
      value,
    }),
  );
}

describe("EntityDetailStaticField", () => {
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

  it.each([null, undefined, ""])("renders the empty-value fallback for %s", (value) => {
    expect(renderField(value)).toContain("—");
  });

  it("preserves zero as a meaningful value", () => {
    const markup = renderField(0);

    expect(markup).toContain(">0</span>");
    expect(markup).not.toContain("—");
  });

  it("omits the help action when no explanation is supplied", () => {
    const markup = renderField("€12,500");

    expect(markup).not.toContain("About Deal value");
    expect(markup).not.toContain('data-slot="tooltip-content"');
    expect(markup).toContain('aria-label="Pin Deal value"');
  });
});
