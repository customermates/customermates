import type { ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";

import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Currency } from "@/generated/prisma";

const testContext = vi.hoisted(() => ({ rootStore: null as RootStore | null }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => testContext.rootStore }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  IntlLink: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children),
}));
vi.mock("@/app/components/topbar-actions-context", () => ({ useSetTopBarActions: vi.fn() }));
vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children: ReactNode }) => createElement("form", null, children),
}));
vi.mock("@/components/forms/form-autocomplete-currency", () => ({
  FormAutocompleteCurrency: () => createElement("div", { "data-currency": true }),
}));
vi.mock("@/components/card/form-actions", () => ({ FormActions: () => null }));

import { CompanySettingsForm } from "../company-settings-form";

const mountedRoots: ReactRoot[] = [];
const mountedContainers: HTMLElement[] = [];

function renderForm(): string {
  testContext.rootStore = {
    companySettingsStore: {
      error: null,
      onInitOrRefresh: vi.fn(),
      onSubmit: vi.fn().mockResolvedValue(undefined),
    },
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

describe("CompanySettingsForm record-model cutover", () => {
  it("shows currency and a Data model link without weighting controls", () => {
    const html = renderForm();
    expect(html).toContain("data-currency");
    expect(html).toContain("/configure");
    expect(html).not.toContain("data-forecasting");
  });

  it("hydrates the currency and Data model link without changing the server structure", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderForm();
    document.body.append(container);
    mountedContainers.push(container);
    const recoverableErrors: unknown[] = [];
    const root = await act(() =>
      hydrateRoot(container, createElement(CompanySettingsForm, { currency: Currency.eur }), {
        onRecoverableError: (error) => recoverableErrors.push(error),
      }),
    );
    mountedRoots.push(root);
    expect(recoverableErrors).toEqual([]);
    expect(container.querySelector('a[href="/configure"]')).not.toBeNull();
  });
});
