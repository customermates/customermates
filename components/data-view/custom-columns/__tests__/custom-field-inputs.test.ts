import type { ComponentType, ReactNode } from "react";
import type { EntityDetailPersonalizationConfig } from "@/components/entity-detail/entity-detail-personalization";
import type { P13nEntry } from "@/features/p13n/prisma-p13n.repository";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

vi.mock("@/app/actions", () => ({ upsertP13nAction: vi.fn() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/data-view/custom-columns/custom-field-value-input", () => ({
  CustomFieldValueInput: ({
    column,
    index,
    labelEndAddon,
  }: {
    column: { id: string };
    index: number;
    labelEndAddon?: ReactNode;
  }) => createElement("div", { "data-column-id": column.id, "data-form-index": index }, labelEndAddon),
}));
vi.mock("@/components/entity-detail/entity-detail-pin-button", () => ({
  EntityDetailPinButton: ({ fieldId }: { fieldId: string }) => createElement("button", { "data-pin-field": fieldId }),
}));
vi.mock("@/components/ui/icon-button", () => ({
  IconButton: () => createElement("button", { "data-move-field": true }),
}));

import { CustomFieldInputs } from "../custom-field-inputs";
import { EntityDetailPersonalizationProvider } from "@/components/entity-detail/entity-detail-personalization";

const ids = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
];
const TestProvider = EntityDetailPersonalizationProvider as ComponentType<{
  children?: ReactNode;
  config: EntityDetailPersonalizationConfig;
  customColumnIds: string[];
  initial: P13nEntry;
  persistenceScope: string;
}>;

describe("CustomFieldInputs", () => {
  it("respects the saved order in drawers while retaining form indexes and hiding personalization controls", () => {
    const columns = ids.map((id, index) => ({
      id,
      entityType: EntityType.contact,
      label: `Field ${index + 1}`,
      type: CustomColumnType.plain,
    }));
    const markup = renderToStaticMarkup(
      createElement(
        TestProvider,
        {
          config: { p13nId: "contact-detail", defaultStarredFieldIds: [] },
          customColumnIds: ids,
          initial: { p13nId: "contact-detail", columnOrder: [ids[2], ids[0], ids[1]] },
          persistenceScope: "user-1",
        },
        createElement(CustomFieldInputs, { columns, isEditing: false }),
      ),
    );

    const thirdPosition = markup.indexOf(`data-column-id="${ids[2]}" data-form-index="2"`);
    const firstPosition = markup.indexOf(`data-column-id="${ids[0]}" data-form-index="0"`);
    const secondPosition = markup.indexOf(`data-column-id="${ids[1]}" data-form-index="1"`);

    expect(thirdPosition).toBeGreaterThanOrEqual(0);
    expect(firstPosition).toBeGreaterThan(thirdPosition);
    expect(secondPosition).toBeGreaterThan(firstPosition);
    expect(markup).not.toContain("data-pin-field");
    expect(markup).not.toContain("data-move-field");
  });
});
