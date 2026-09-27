import type { ReactNode } from "react";

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
    getValue: () => undefined,
    isLoading: false,
    isReadOnly: false,
    onChange: vi.fn(),
  }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({ useHydratedIntlStore: () => ({}) }));
vi.mock("@/core/utils/use-copy-to-clipboard", () => ({ useCopyToClipboard: () => vi.fn() }));
vi.mock("@/components/shared/favicon", () => ({ Favicon: () => null }));
vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children, variant }: { children?: ReactNode; variant?: string }) =>
    createElement("span", { "data-chip-variant": variant }, children),
}));

import { CustomFieldEditor } from "../custom-field-editor";

function chipVariants(): string[] {
  const markup = renderToStaticMarkup(
    createElement(CustomFieldEditor, {
      column: {
        entityType: EntityType.contact,
        id: "10000000-0000-4000-8000-000000000001",
        label: "Links",
        options: { allowMultiple: true, color: "info" },
        type: CustomColumnType.link,
      },
      hideLabel: true,
      id: "customFieldValues[0].value",
      value: "https://example.com,not-a-link",
      onChange: vi.fn(),
    }),
  );

  return [...markup.matchAll(/data-chip-variant="([^"]*)"/g)].map(([, variant]) => variant);
}

describe("CustomFieldEditor link chip errors", () => {
  it("marks only the invalid link chip as destructive, like the email and phone chips", () => {
    formErrors.current = { "customFieldValues[0].value[1]": ["The link value is invalid."] };

    expect(chipVariants()).toEqual(["info", "destructive"]);
  });

  it("keeps the column colour without errors", () => {
    formErrors.current = {};

    expect(chipVariants()).toEqual(["info", "info"]);
  });
});
