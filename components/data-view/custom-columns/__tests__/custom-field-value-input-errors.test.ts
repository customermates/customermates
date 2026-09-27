import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

const formErrors = vi.hoisted(() => ({ current: {} as Record<string, string[]> }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: (entity: string) => entity }),
}));
vi.mock("@/components/forms/form-context", () => ({
  useAppForm: () => ({
    getError: (key: string) => formErrors.current[key],
    getValue: () => "+12025550105,not-a-phone",
    onChange: vi.fn(),
  }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ customColumnModalStore: { openWithColumn: vi.fn() } }),
}));
vi.mock("../custom-field-editor", () => ({ CustomFieldEditor: () => null }));

import { CustomFieldValueInput } from "../custom-field-value-input";

function labelClass(): string {
  const markup = renderToStaticMarkup(
    createElement(CustomFieldValueInput, {
      column: {
        entityType: EntityType.contact,
        id: "10000000-0000-4000-8000-000000000001",
        label: "Phones",
        options: { allowMultiple: true, color: "secondary" },
        type: CustomColumnType.phone,
      },
      index: 0,
      isEditing: false,
    }),
  );
  const match = /<label[^>]*class="([^"]*)"[^>]*>Phones/.exec(markup);
  if (!match) throw new Error(`Expected the Phones label in ${markup}`);
  return match[1];
}

describe("CustomFieldValueInput label errors", () => {
  it("colours the label when only one chip of a multi-value field has an error", () => {
    formErrors.current = { "customFieldValues[0].value[1]": ["The phone value is invalid."] };

    expect(labelClass()).toContain("text-destructive");
    expect(labelClass()).not.toContain("text-muted-foreground");
  });

  it("colours the label for an error on the whole value", () => {
    formErrors.current = { "customFieldValues[0].value": ["The phone value is invalid."] };

    expect(labelClass()).toContain("text-destructive");
  });

  it("keeps the label muted without errors", () => {
    formErrors.current = {};

    expect(labelClass()).toContain("text-muted-foreground");
    expect(labelClass()).not.toContain("text-destructive");
  });
});
