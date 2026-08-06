import type { ReactNode } from "react";
import type { RootStore } from "@/core/stores/root.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Currency } from "@/generated/prisma";

const testContext = vi.hoisted(() => ({ rootStore: null as RootStore | null }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: vi.fn(),
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: () => "Records" }),
}));
vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children: ReactNode }) => createElement("form", null, children),
}));
vi.mock("@/components/forms/form-autocomplete-currency", () => ({
  FormAutocompleteCurrency: () => createElement("div", { "data-currency": true }),
}));
vi.mock("@/components/card/form-actions", () => ({ FormActions: () => null }));
vi.mock("@/components/entity-terminology/terminology-relationship-diagram", () => ({
  TerminologyRelationshipDiagram: ({ readOnly, onPreset }: { readOnly: boolean; onPreset?: unknown }) =>
    createElement("div", {
      "data-has-on-preset": Boolean(onPreset),
      "data-read-only": readOnly,
    }),
}));

import { CompanySettingsForm } from "../company-settings-form";

function renderForm(canManage: boolean): string {
  testContext.rootStore = {
    companySettingsStore: {
      canManage,
      error: null,
      form: { terminology: {} },
      initTerminology: vi.fn(),
      onInitOrRefresh: vi.fn(),
      onSubmit: vi.fn().mockResolvedValue(undefined),
      setTerminologyPreset: vi.fn(),
    },
    terminologyStore: { overrides: [] },
  } as unknown as RootStore;

  return renderToStaticMarkup(createElement(CompanySettingsForm, { currency: Currency.eur }));
}

beforeEach(() => {
  testContext.rootStore = null;
});

describe("CompanySettingsForm terminology permissions", () => {
  it("keeps the data model read-only without company-management access", () => {
    const html = renderForm(false);

    expect(html).toContain('data-read-only="true"');
    expect(html).toContain('data-has-on-preset="false"');
    expect(html).not.toContain('role="separator"');
  });

  it("passes the preset setter to company managers", () => {
    const html = renderForm(true);

    expect(html).toContain('data-read-only="false"');
    expect(html).toContain('data-has-on-preset="true"');
    expect(html).not.toContain('role="separator"');
  });
});
