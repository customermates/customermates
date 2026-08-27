import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/forms/form-context", () => ({
  useAppForm: () => ({
    getError: () => undefined,
    getValue: () => "person@example.com",
    onChange: vi.fn(),
  }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ customColumnModalStore: { openWithColumn: vi.fn() } }),
}));
vi.mock("../custom-field-editor", () => ({
  CustomFieldEditor: ({ ariaLabelledBy }: { ariaLabelledBy?: string; children?: ReactNode }) =>
    createElement("div", { "data-editor-labelled-by": ariaLabelledBy }),
}));

import { CustomFieldValueInput } from "../custom-field-value-input";

describe("CustomFieldValueInput accessible naming", () => {
  it("passes the visible custom-field label to label-hidden read-only editors", () => {
    const markup = renderToStaticMarkup(
      createElement(CustomFieldValueInput, {
        column: {
          entityType: EntityType.contact,
          id: "10000000-0000-4000-8000-000000000001",
          label: "Alternative email",
          options: { allowMultiple: true, color: "secondary" },
          type: CustomColumnType.email,
        },
        index: 3,
        isEditing: false,
      }),
    );
    const labelId = "customFieldValues[3].value-label";

    expect(markup).toContain(`id="${labelId}"`);
    expect(markup).toContain(`data-editor-labelled-by="${labelId}"`);
    expect(markup).toContain("Alternative email");
  });
});
