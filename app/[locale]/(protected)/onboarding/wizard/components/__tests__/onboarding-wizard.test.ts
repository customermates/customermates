import type { RootStore } from "@/core/stores/root.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({
  rootStore: null as RootStore | null,
  wikiProps: null as null | {
    onAccepted: (conversationId: string) => void | Promise<void>;
    onSkip?: () => void;
  },
  openAgentChat: vi.fn(),
  loadAgentConfig: vi.fn(),
  selectConversation: vi.fn(),
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

vi.mock("../../actions", () => ({ completeOnboardingWizardAction: vi.fn() }));
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
  WikiHomepageSetup: (props: { onAccepted: (conversationId: string) => void | Promise<void>; onSkip?: () => void }) => {
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
  wikiCompleted = false,
): string {
  const store = new OnboardingWizardStore({} as RootStore);
  testContext.rootStore = {
    agentChatStore: {
      open: testContext.openAgentChat,
      loadConfig: testContext.loadAgentConfig,
      selectConversation: testContext.selectConversation,
    },
    onboardingWizardStore: store,
  } as unknown as RootStore;

  return renderToStaticMarkup(
    createElement(OnboardingWizard, { profileCompleted, isInvited, canSetupWithMate, wikiCompleted }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  testContext.loadAgentConfig.mockResolvedValue(undefined);
  testContext.selectConversation.mockResolvedValue(undefined);
  testContext.rootStore = null;
  testContext.wikiProps = null;
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

  it.each(["onAccepted", "onSkip"] as const)("advances an owner from Wiki when %s fires", async (callback) => {
    renderWizard(true);
    const props = testContext.wikiProps;
    if (!props) throw new Error("Wiki setup did not render.");
    testContext.rootStore?.onboardingWizardStore.setInitialStep(1);

    if (callback === "onAccepted") await props.onAccepted("conversation-1");
    else props.onSkip?.();

    expect(testContext.rootStore?.onboardingWizardStore.currentStep).toBe("invite");
    if (callback === "onAccepted") {
      expect(testContext.openAgentChat).toHaveBeenCalledOnce();
      expect(testContext.loadAgentConfig).toHaveBeenCalledOnce();
      expect(testContext.selectConversation).toHaveBeenCalledExactlyOnceWith("conversation-1");
    }
  });

  it("offers only Skip on the Wiki step when Mate is unavailable", () => {
    const html = renderWizard(true, false, false);

    expect(html).toContain("WikiSetup.unavailable");
    expect(html).toContain("WikiSetup.skip");
    expect(testContext.wikiProps).toBeNull();
  });

  it("does not mutate the shared wizard store during render", () => {
    const store = new OnboardingWizardStore({} as RootStore);
    testContext.rootStore = {
      agentChatStore: {
        open: testContext.openAgentChat,
        loadConfig: testContext.loadAgentConfig,
        selectConversation: testContext.selectConversation,
      },
      onboardingWizardStore: store,
    } as unknown as RootStore;

    renderToStaticMarkup(createElement(OnboardingWizard, { profileCompleted: true }));

    expect(store.currentStep).toBe("profile");
  });
});
