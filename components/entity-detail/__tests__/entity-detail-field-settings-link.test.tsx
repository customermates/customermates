import type { EntityDetailPersonalizationValue } from "../entity-detail-personalization";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EntityDetailFieldActions } from "../entity-detail-field-actions";
import { EntityDetailPersonalizationContext } from "../entity-detail-personalization";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { field?: string }) => `${key}:${values?.field ?? ""}`,
}));
vi.mock("../entity-detail-pin-button", () => ({ EntityDetailPinButton: () => null }));
vi.mock("@/components/ui/icon-button", () => ({
  IconButton: ({ label, href }: { label: string; href?: string }) =>
    href ? createElement("a", { "aria-label": label, href }) : createElement("button", { "aria-label": label }),
}));

function render(overrides: Partial<EntityDetailPersonalizationValue>) {
  const value = {
    enabled: true,
    isPersonalizing: true,
    hiddenFieldIds: [],
    toggleFieldVisibility: () => undefined,
    fieldSettingsHref: (fieldId: string) => (fieldId === "price" ? "/configure?focus=field%3Aprice" : null),
    ...overrides,
  } as EntityDetailPersonalizationValue;
  return renderToStaticMarkup(
    createElement(
      EntityDetailPersonalizationContext.Provider,
      { value },
      createElement(EntityDetailFieldActions, { fieldId: "price", label: "Price" }),
    ),
  );
}

describe("EntityDetailFieldActions field settings link", () => {
  it("links a configurable field to its Configure drawer while customizing", () => {
    const html = render({});

    expect(html).toContain('aria-label="EntityDetail.configureField:Price"');
    expect(html).toContain('href="/configure?focus=field%3Aprice"');
  });

  it("shows no link outside customize mode, without configure rights or for unconfigurable fields", () => {
    expect(render({ isPersonalizing: false })).not.toContain("configureField");
    expect(render({ fieldSettingsHref: undefined })).not.toContain("configureField");
    expect(render({ fieldSettingsHref: () => null })).not.toContain("configureField");
  });
});
