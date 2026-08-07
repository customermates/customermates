import type { ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";

import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const mountedRoots: ReactRoot[] = [];
const mountedContainers: HTMLElement[] = [];

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

  return renderToString(createElement(CompanySettingsForm, { currency: Currency.eur }));
}

beforeEach(() => {
  testContext.rootStore = null;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  for (const container of mountedContainers.splice(0)) container.remove();
});

describe("CompanySettingsForm terminology permissions", () => {
  it.each([false, true])("keeps the initial %s permission render hydration-safe", (canManage) => {
    const html = renderForm(canManage);

    expect(html).toContain('data-read-only="true"');
    expect(html).toContain('data-has-on-preset="false"');
    expect(html).not.toContain('role="separator"');
  });

  it.each([
    { canManage: true, expectedReadOnly: "false", expectedOnPreset: "true" },
    { canManage: false, expectedReadOnly: "true", expectedOnPreset: "false" },
  ])(
    "applies the $canManage permission after hydration without changing the server structure",
    async ({ canManage, expectedReadOnly, expectedOnPreset }) => {
      const container = document.createElement("div");
      container.innerHTML = renderForm(canManage);
      document.body.append(container);
      mountedContainers.push(container);

      const recoverableErrors: unknown[] = [];
      const root = await act(() =>
        hydrateRoot(container, createElement(CompanySettingsForm, { currency: Currency.eur }), {
          onRecoverableError: (error) => recoverableErrors.push(error),
        }),
      );
      mountedRoots.push(root);

      const diagram = container.querySelector<HTMLElement>("[data-read-only]");
      expect(recoverableErrors).toEqual([]);
      expect(diagram?.dataset.readOnly).toBe(expectedReadOnly);
      expect(diagram?.dataset.hasOnPreset).toBe(expectedOnPreset);
    },
  );
});
