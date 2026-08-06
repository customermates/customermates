import type { RootStore } from "@/core/stores/root.store";

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({
  rootStore: null as RootStore | null,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));

vi.mock("@/app/[locale]/(protected)/profile/actions", () => ({
  createApiKeyAction: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/modal", () => ({
  AppModal: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn() }),
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode }) => createElement("a", props, children),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { ApiKeyModalStore } from "../api-key-modal.store";
import { ApiKeyModal } from "../api-key-modal";

function renderModal(path: "wizard" | "plain" = "wizard") {
  const rootStore = {
    apiKeysStore: { refresh: vi.fn() },
    intlStore: { formatDescriptiveLongDate: vi.fn() },
    registerModalStore: vi.fn(),
    terminologyStore: { overrides: {} },
    userStore: {
      can: vi.fn().mockReturnValue(true),
      canAccess: vi.fn().mockReturnValue(true),
      canManage: vi.fn().mockReturnValue(true),
      user: null,
    },
  } as unknown as RootStore;
  const store = new ApiKeyModalStore(rootStore);
  Object.assign(rootStore, { apiKeyModalStore: store });
  store.add();
  if (path === "plain") store.choosePlain();
  testContext.rootStore = rootStore;

  return renderToStaticMarkup(createElement(ApiKeyModal));
}

beforeEach(() => {
  testContext.rootStore = null;
  vi.stubGlobal("window", { location: { origin: "http://localhost:4001" } });
});

describe("ApiKeyModal add wizard", () => {
  it("starts with one standard key option and the same five quick connections", () => {
    const html = renderModal();

    expect(html.match(/data-api-key-option="plain"/g)).toHaveLength(1);
    expect(html.match(/data-provider=/g)).toHaveLength(5);
    expect(html).toContain("ApiKeyModal.quickTitle");
    expect(html).not.toContain("OnboardingWizard.ai.choices.skip");
    expect(html).not.toContain("OnboardingWizard.finish");
  });

  it("keeps the existing named and expiring standard-key form behind its option", () => {
    const html = renderModal("plain");

    expect(html).toContain("ApiKeyModal.backToOptions");
    expect(html).toContain('id="name"');
    expect(html).toContain('id="expiresIn"');
    expect(html).toContain('id="api-key-save"');
  });
});
