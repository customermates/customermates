import type { RootStore } from "@/core/stores/root.store";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import type { ReactNode } from "react";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observable } from "mobx";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({
  rootStore: null as RootStore | null,
  wikiProps: null as null | {
    onAccepted: (conversationId: string) => void | Promise<void>;
    onContinue?: () => void | Promise<void>;
    onSkip?: () => void | Promise<void>;
    canStart?: boolean;
    disabled?: boolean;
    onboarding?: boolean;
    renderConversation?: (conversationId: string) => ReactNode;
  },
  embeddedSelectConversation: vi.fn(),
  wikiSetupChatStore: null as Record<string, unknown> | null,
  completeWikiStep: vi.fn(),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${value}`)
          .join(" ")}`
      : key,
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/components/agent-chat/agent-chat-store-context", () => ({
  AgentChatStoreProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/app/components/agent-chat/agent-route-reload", () => ({ AgentRouteReloadBridge: () => null }));
vi.mock("@/app/components/agent-chat/agent-conversation", () => ({
  AgentConversationLog: ({ readOnly, renderLinksAsText }: { readOnly?: boolean; renderLinksAsText?: boolean }) =>
    createElement("div", {
      "data-agent-conversation": true,
      "data-links-as-text": renderLinksAsText,
      "data-read-only": readOnly,
    }),
}));
vi.mock("@/app/components/agent-chat/agent-status-announcer", () => ({
  AgentProgressStatus: () => createElement("div", { "data-agent-progress": true }),
  AgentStatusAnnouncer: () => createElement("div", { "data-agent-announcer": true }),
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("../../actions", () => ({
  completeOnboardingWikiStepAction: testContext.completeWikiStep,
  completeOnboardingWizardAction: vi.fn(),
}));
vi.mock("../step-profile", () => ({
  StepProfile: () => createElement("div", { "data-step": "profile" }),
}));
vi.mock("../step-invite", () => ({
  StepInvite: () => createElement("div", { "data-step": "invite" }),
}));
vi.mock("../step-ai", () => ({
  StepAi: () => createElement("div", { "data-step": "ai" }),
  StepAiFooter: () => createElement("div", { "data-step-footer": "ai" }),
}));
vi.mock("@/components/wiki/wiki-homepage-setup", () => ({
  EMPTY_WIKI_HOMEPAGE_SETUP_STATE: {
    status: "idle",
    homepage: null,
    domain: null,
    conversationId: null,
    pages: [],
  },
  WikiHomepageSetup: (props: {
    onAccepted: (conversationId: string) => void | Promise<void>;
    onContinue?: () => void | Promise<void>;
    onSkip?: () => void | Promise<void>;
    canStart?: boolean;
    disabled?: boolean;
    onboarding?: boolean;
    renderConversation?: (conversationId: string) => ReactNode;
  }) => {
    testContext.wikiProps = props;
    return createElement("div", { "data-step": "wiki" });
  },
}));

import { OnboardingWizardStore } from "../onboarding-wizard.store";
import { OnboardingWizard } from "../onboarding-wizard";

function renderWizard(
  profileCompleted: boolean,
  isInvited = false,
  canSetupWithMate = true,
  wikiStepCompleted = false,
  wikiSetupState?: WikiHomepageSetupState,
): string {
  const store = new OnboardingWizardStore({} as RootStore);
  const wikiSetupChatStore = observable({
    conversationId: null as string | null,
    conversationLoadError: false,
    conversationLoadPendingId: null as string | null,
    isWorking: false,
    routeSyncStatus: "idle",
    markRouteSyncComplete: vi.fn(),
    selectConversationForEmbeddedViewer: testContext.embeddedSelectConversation,
  });
  testContext.wikiSetupChatStore = wikiSetupChatStore;
  testContext.rootStore = {
    onboardingWizardStore: store,
    wikiSetupChatStore,
  } as unknown as RootStore;

  return renderToStaticMarkup(
    createElement(OnboardingWizard, {
      profileCompleted,
      isInvited,
      canSetupWithMate,
      wikiStepCompleted,
      wikiSetupState,
    }),
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  testContext.embeddedSelectConversation.mockResolvedValue(undefined);
  testContext.completeWikiStep.mockResolvedValue({ ok: true, data: { completed: true } });
  testContext.rootStore = null;
  testContext.wikiProps = null;
  testContext.wikiSetupChatStore = null;
});

describe("OnboardingWizard", () => {
  it.each([
    [false, "profile", 1],
    [true, "wiki", 2],
  ] as const)("initializes profileCompleted=%s at the %s step", (profileCompleted, step, current) => {
    const html = renderWizard(profileCompleted);

    expect(html).toContain(`data-step="${step}"`);
    expect(html).toContain(`OnboardingWizard.progress current=${current} total=4`);
    expect(html).toContain(`OnboardingWizard.steps.${step}.title`);
    expect(html).toContain('<h1 class="text-2xl font-semibold" tabindex="-1">');
    expect(html).not.toContain("OnboardingWizard.steps.terminology");
  });

  it("keeps shared Back and Next navigation off Profile and Wiki", () => {
    expect(renderWizard(false)).not.toContain('id="onboarding-next"');
    expect(renderWizard(true)).not.toContain('id="onboarding-back"');
    expect(renderWizard(true)).not.toContain('id="onboarding-next"');
  });

  it("keeps an invited member on Profile and never exposes the owner Wiki step", () => {
    const html = renderWizard(false, true);

    expect(html).toContain('data-step="profile"');
    expect(html).toContain("OnboardingWizard.steps.profile.invitedSubtitle");
    expect(html).not.toContain('data-step="wiki"');
    expect(html).not.toContain("OnboardingWizard.progress current=");
  });

  it("starts a registered invitee after Wiki and starts an owner with pages after Wiki", () => {
    expect(renderWizard(true, true)).toContain('data-step="invite"');
    expect(renderWizard(true, false, true, true)).toContain('data-step="invite"');
  });

  it("keeps acceptance lightweight and leaves loading to the inline viewer", async () => {
    renderWizard(true);
    const props = testContext.wikiProps;
    if (!props) throw new Error("Wiki setup did not render.");
    testContext.rootStore?.onboardingWizardStore.setInitialStep(1);

    await props.onAccepted("conversation-1");

    expect(testContext.rootStore?.onboardingWizardStore.currentStep).toBe("wiki");
    expect(testContext.embeddedSelectConversation).not.toHaveBeenCalled();
    expect(props.renderConversation).toBeTypeOf("function");
  });

  it("renders the selected setup conversation read-only with text-only links", () => {
    renderWizard(true);
    const props = testContext.wikiProps;
    const chatStore = testContext.wikiSetupChatStore;
    if (!props?.renderConversation || !chatStore) throw new Error("Wiki setup conversation did not render.");
    chatStore.conversationId = "conversation-1";
    chatStore.isWorking = true;

    const html = renderToStaticMarkup(props.renderConversation("conversation-1"));

    expect(html).toContain('data-agent-conversation="true"');
    expect(html).toContain('data-read-only="true"');
    expect(html).toContain('data-links-as-text="true"');
    expect(html).toContain('data-agent-progress="true"');
    expect(html).toContain('data-agent-announcer="true"');
    expect(html).not.toContain("agent-composer");
  });

  it("loads a restored setup conversation through the dedicated embedded store", async () => {
    renderWizard(true);
    const props = testContext.wikiProps;
    const chatStore = testContext.wikiSetupChatStore;
    if (!props?.renderConversation || !chatStore) throw new Error("Wiki setup conversation did not render.");
    testContext.embeddedSelectConversation.mockImplementation((conversationId: string) => {
      chatStore.conversationId = conversationId;
      return Promise.resolve();
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(props.renderConversation?.("conversation-restored"));
      await Promise.resolve();
    });
    expect(testContext.embeddedSelectConversation).toHaveBeenCalledExactlyOnceWith("conversation-restored");
    expect(container.querySelector('[data-agent-conversation="true"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="PageState.loading"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("retries a failed inline transcript load without opening the floating assistant", async () => {
    renderWizard(true);
    const props = testContext.wikiProps;
    const chatStore = testContext.wikiSetupChatStore;
    if (!props?.renderConversation || !chatStore) throw new Error("Wiki setup conversation did not render.");
    chatStore.conversationId = "conversation-1";
    chatStore.conversationLoadError = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(props.renderConversation?.("conversation-1"));
      await Promise.resolve();
    });
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("ErrorCard.retry"),
    );
    if (!retry) throw new Error("Inline transcript retry did not render.");
    await act(async () => {
      retry.click();
      await Promise.resolve();
    });

    expect(testContext.embeddedSelectConversation).toHaveBeenCalledExactlyOnceWith("conversation-1");

    act(() => root.unmount());
    container.remove();
  });

  it.each(["onContinue", "onSkip"] as const)("advances an owner from Wiki when %s fires", async (callback) => {
    renderWizard(true);
    const props = testContext.wikiProps;
    if (!props) throw new Error("Wiki setup did not render.");
    testContext.rootStore?.onboardingWizardStore.setInitialStep(1);

    await props[callback]?.();

    expect(testContext.rootStore?.onboardingWizardStore.currentStep).toBe("invite");
  });

  it("coalesces concurrent Continue clicks so Invite cannot be skipped", async () => {
    let resolve!: (value: { ok: true; data: { completed: true } }) => void;
    testContext.completeWikiStep.mockReturnValue(new Promise((done) => (resolve = done)));
    renderWizard(true);
    const props = testContext.wikiProps;
    if (!props) throw new Error("Wiki setup did not render.");
    testContext.rootStore?.onboardingWizardStore.setInitialStep(1);

    const first = props.onContinue?.();
    const second = props.onContinue?.();
    expect(testContext.completeWikiStep).toHaveBeenCalledOnce();
    expect(testContext.rootStore?.onboardingWizardStore.isSubmitting).toBe(true);

    resolve({ ok: true, data: { completed: true } });
    await Promise.all([first, second]);

    expect(testContext.rootStore?.onboardingWizardStore.currentStep).toBe("invite");
    expect(testContext.rootStore?.onboardingWizardStore.isSubmitting).toBe(false);
  });

  it("offers only Skip on the Wiki step when Mate is unavailable", () => {
    const html = renderWizard(true, false, false);

    expect(html).toContain("WikiSetup.unavailable");
    expect(html).toContain("WikiSetup.skip");
    expect(testContext.wikiProps).toBeNull();
  });

  it("keeps an existing setup visible when Mate becomes unavailable", () => {
    renderWizard(true, false, false, false, {
      status: "working",
      homepage: "https://example.com/",
      domain: "example.com",
      conversationId: "conversation-1",
      pages: [],
    });

    expect(testContext.wikiProps).toMatchObject({ canStart: false, onboarding: true });
  });

  it("does not mutate the shared wizard store during render", () => {
    const store = new OnboardingWizardStore({} as RootStore);
    testContext.rootStore = {
      onboardingWizardStore: store,
    } as unknown as RootStore;

    renderToStaticMarkup(createElement(OnboardingWizard, { profileCompleted: true }));

    expect(store.currentStep).toBe("profile");
  });
});
