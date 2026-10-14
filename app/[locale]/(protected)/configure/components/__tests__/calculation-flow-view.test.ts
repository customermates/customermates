import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RecordField, RecordModelView } from "@/features/records/record-model.schema";

import messages from "@/i18n/locales/en.json";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordInvariant } from "@/features/records/record-invariant";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const text = key
      .split(".")
      .reduce<unknown>(
        (current, segment) => (current && typeof current === "object" ? Reflect.get(current, segment) : undefined),
        messages,
      );
    return String(text ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? name));
  },
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formattingLocale: "en-US",
    formatNumber: (value: number) => String(value),
    formatDescriptiveShortDate: () => "",
    formatDescriptiveShortDateTime: () => "",
  }),
}));
vi.mock("@/app/components/agent-chat/actions", () => ({ draftCalculationAction: vi.fn() }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({ previewCalculationAction: vi.fn() }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({}) }));

const { CalculationFlowView } = await import("../calculation-flow-editor");

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const model = { ...createCrmPreset(company), capabilities: [] } as unknown as RecordModelView;
const fieldOf = (key: string) =>
  recordInvariant(model.fields.find((field) => field.id === presetId(company, key))) as RecordField;
const render = (key: string) =>
  renderToStaticMarkup(createElement(CalculationFlowView, { field: fieldOf(key), model }));
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("read-only calculation flow", () => {
  it("renders a saved formula as nodes with one-line steps and no editing controls", () => {
    const markup = render("deal.weightedValue");
    expect(markup).toContain('data-calculation-readonly=""');
    expect(markup).toContain('data-calculation-flow="formula"');
    expect(markup.match(/data-calculation-node="step"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="Calculation: Multiply"');
    expect(markup).toContain('aria-label="Calculation: Divide"');
    const content = text(markup);
    const order = ["Inputs", "Step 1", "Value", "×", "Step 2", "Step 1", "÷", "100", "Weighted value", "Money"];
    let position = 0;
    for (const part of order) {
      const next = content.indexOf(part, position);
      expect(next, part).toBeGreaterThanOrEqual(position);
      position = next + part.length;
    }
    expect(content).not.toContain("Add input");
    expect(markup).not.toContain("data-calculation-insert-step");
    expect(markup).not.toContain("data-calculation-extend-step");
    expect(markup).not.toMatch(/<button|tabindex="0"|role="button"/);
  });

  it("renders a rollup read-only and nothing for an input field", () => {
    const markup = render("deal.totalValue");
    expect(markup).toContain('data-calculation-flow="rollup"');
    expect(markup).toContain('data-calculation-node="linked"');
    expect(markup).not.toMatch(/<button|tabindex="0"|role="button"/);
    const input = model.fields.find((field) => field.behavior.kind === "input");
    expect(
      renderToStaticMarkup(createElement(CalculationFlowView, { field: recordInvariant(input) as RecordField, model })),
    ).toBe("");
  });
});
