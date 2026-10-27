import type { ReactNode } from "react";
import type { RecordFieldView } from "@/features/records/record-model.schema";

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const form = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { field?: string }) =>
    values?.field ? `${key}(${values.field})` : key,
}));
vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children: ReactNode }) => children,
  useAppForm: () => ({ getValue: () => form.value, getError: () => undefined, isDisabled: false, onChange: vi.fn() }),
}));
vi.mock("@/components/forms/use-form-field", () => ({
  useFormFieldErrors: () => ({ hasError: false, message: null }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({}) }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formattingLocale: "en-US" }),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
  TooltipContent: () => null,
}));
vi.mock("@/components/modal/app-modal", () => ({ AppModal: () => null, AppModalTitle: () => null }));
vi.mock("@/components/modal/confirm-dialog", () => ({ DiscardChangesDialog: () => null }));
vi.mock("../record-address-input", () => ({ RecordAddressInput: () => null }));
vi.mock("../record-address-draft.store", () => ({ RecordAddressDraftStore: vi.fn() }));

import { RecordAddressField } from "../record-address-field";

const FIELD = { id: "address", label: "Address", required: false } as unknown as RecordFieldView;

function render(value: unknown): string {
  form.value = value;
  return renderToStaticMarkup(createElement(RecordAddressField, { field: FIELD, id: "address" }));
}

function buttonAttribute(markup: string, name: string): string | null {
  return new RegExp(`<button[^>]*\\s${name}="([^"]*)"`).exec(markup)?.[1] ?? null;
}

describe("address field trigger", () => {
  it("names the field with its address so screen readers hear the value", () => {
    const markup = render({ street: "Hauptstraße 5", postalCode: "68259", city: "Mannheim", countryCode: "de" });

    expect(buttonAttribute(markup, "aria-label")).toBe(
      "RecordModel.editValue(Address): Hauptstraße 5, 68259 Mannheim, Germany",
    );
    expect(buttonAttribute(markup, "data-variant")).toBe("field");
    expect(markup).toContain(">Hauptstraße 5, 68259 Mannheim, Germany<");
  });

  it("offers to add an address when the field is empty", () => {
    const markup = render(undefined);

    expect(buttonAttribute(markup, "aria-label")).toBe("RecordModel.editValue(Address)");
    expect(markup).toContain(">RecordModel.addValue(Address)<");
  });
});
