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
  useTranslations: () =>
    Object.assign((key: string) => key, {
      rich: (key: string, values?: Record<string, (chunks: string) => ReactNode>) =>
        createElement("span", null, key, " ", values?.guide?.("guide")),
    }),
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

function renderModal(path: "wizard" | "plain" = "wizard", provider?: "codex" | "cursor" | "gemini") {
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
  if (provider) store.aiConnectionStore.selectProvider(provider);
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
    expect(html).toContain("Common.actions.cancel");
    expect(html).not.toContain("Common.actions.back");
    expect(html).not.toContain("ApiKeyModal.done");
    expect(html).not.toContain("OnboardingWizard.ai.choices.skip");
    expect(html).not.toContain("OnboardingWizard.finish");
  });

  it("keeps the existing named and expiring standard-key form behind its option", () => {
    const html = renderModal("plain");

    expect(html).toContain("Common.actions.back");
    expect(html).not.toContain("ApiKeyModal.backToOptions");
    expect(html).not.toContain("Common.actions.cancel");
    expect(html).toContain('id="name"');
    expect(html).toContain('id="expiresIn"');
    expect(html).toContain('id="api-key-save"');
  });

  it("uses the shared full-card key action for quick connections", () => {
    const html = renderModal("wizard", "cursor");
    const createCard = (html.match(/<button\b[\s\S]*?<\/button>/g) ?? []).find((button) =>
      button.includes("OnboardingWizard.ai.createKey"),
    );

    expect(createCard).toContain('data-api-key-setup="cursor"');
    expect(createCard).toContain("OnboardingWizard.ai.createKeyIntro");
    expect(createCard).toContain("lucide-arrow-right");
  });

  it("promotes quick-connection titles into the modal header and moves Back into the footer", () => {
    const html = renderModal("wizard", "codex");

    expect(html.match(/OnboardingWizard\.ai\.screen\.setup\.title/g)).toHaveLength(1);
    expect(html).toContain("Common.actions.back");
    expect(html).toContain("ApiKeyModal.done");
    expect(html).not.toContain("Common.actions.cancel");
    expect(html).not.toContain("ApiKeyModal.backToOptions");
    expect(html).not.toContain("<h2>OnboardingWizard.ai.screen.setup.title</h2>");
  });
});
