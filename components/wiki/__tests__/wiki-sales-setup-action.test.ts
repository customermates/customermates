import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Action } from "@/generated/prisma";

import messages from "@/i18n/locales/en.json";

const harness = vi.hoisted(() => ({
  store: {} as Record<string, unknown>,
  can: vi.fn(),
  focus: vi.fn(),
  open: vi.fn(),
  start: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ agentChatStore: harness.store, agentChatEnabled: true, userStore: { can: harness.can } }),
}));
vi.mock("@/app/components/agent-chat/chat-ui", () => ({ focusAgentComposer: harness.focus }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace: harness.replace }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    key === "Wiki.salesSetup.label" ? messages.Wiki.salesSetup.label : messages.Wiki.salesSetup.prompt,
}));

import { WikiSalesSetupAction, WikiSalesSetupStarter } from "../wiki-sales-setup-action";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  harness.can.mockReturnValue(true);
  harness.store = {
    enabled: true,
    usage: null,
    isWorking: false,
    historyMutationPending: false,
    queuedPrompt: null,
    composerDraft: "",
    composerContexts: [],
    newConversation: harness.start,
    openWithDraft: harness.open,
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
    await Promise.resolve();
  });
  container.remove();
});

async function render(disabled = false) {
  await act(async () => {
    root.render(createElement(WikiSalesSetupAction, { disabled }));
    await Promise.resolve();
  });
  return container.querySelector("button");
}

describe("sales knowledge setup entry", () => {
  it("prefills a fresh chat with a question-first request, without submitting it", async () => {
    const button = await render();
    expect(button?.textContent).toContain("Teach Mate how you sell");
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(harness.start).toHaveBeenCalledOnce();
    expect(harness.open).toHaveBeenCalledExactlyOnceWith(messages.Wiki.salesSetup.prompt);
    expect(harness.start.mock.invocationCallOrder[0]).toBeLessThan(harness.open.mock.invocationCallOrder[0]);
    expect(harness.focus).toHaveBeenCalledOnce();
    expect(messages.Wiki.salesSetup.prompt).toContain("Wait for my answers before creating or changing any page");
    expect(messages.Wiki.salesSetup.prompt).toContain("Do not change CRM configuration or records");
  });

  it("does not expose a server-rendered action before capability hydration", () => {
    expect(renderToString(createElement(WikiSalesSetupAction))).toBe("");
  });

  it("offers the action before the first chat config loads when the shell enables Mate", async () => {
    harness.store.enabled = null;
    const button = await render();
    expect(button?.disabled).toBe(false);
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(harness.open).toHaveBeenCalledExactlyOnceWith(messages.Wiki.salesSetup.prompt);
  });

  it.each([{ enabled: false }, { usage: { blockedReason: "credits" } }])(
    "hides the action when Mate cannot run: %j",
    async (state) => {
      Object.assign(harness.store, state);
      expect(await render()).toBeNull();
    },
  );

  it.each([Action.create, Action.update])("requires the %s permission", async (missing) => {
    harness.can.mockImplementation((_resource: string, action: string) => action !== missing);
    expect(await render()).toBeNull();
  });

  it.each([
    { isWorking: true },
    { historyMutationPending: true },
    { queuedPrompt: "Waiting task" },
    { composerDraft: "My unfinished question" },
    { composerContexts: [{ id: "selected-record" }] },
  ])("preserves unfinished chat work: %j", async (state) => {
    Object.assign(harness.store, state);
    const button = await render();
    expect(button?.disabled).toBe(true);
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    expect(harness.start).not.toHaveBeenCalled();
    expect(harness.open).not.toHaveBeenCalled();
  });

  it("respects the surrounding form's pending or unsaved state", async () => {
    expect((await render(true))?.disabled).toBe(true);
  });

  it("consumes the onboarding entry once and opens an editable request", async () => {
    await act(async () => {
      root.render(createElement(WikiSalesSetupStarter));
      await Promise.resolve();
    });
    expect(harness.open).toHaveBeenCalledExactlyOnceWith(messages.Wiki.salesSetup.prompt);
    expect(harness.replace).toHaveBeenCalledExactlyOnceWith("/wiki", { scroll: false });
    await act(async () => {
      root.render(createElement(WikiSalesSetupStarter));
      await Promise.resolve();
    });
    expect(harness.open).toHaveBeenCalledOnce();
  });

  it("consumes a bookmarked onboarding entry without replacing an existing draft", async () => {
    harness.store.composerDraft = "Keep this request";
    await act(async () => {
      root.render(createElement(WikiSalesSetupStarter));
      await Promise.resolve();
    });
    expect(harness.open).not.toHaveBeenCalled();
    expect(harness.start).not.toHaveBeenCalled();
    expect(harness.replace).toHaveBeenCalledExactlyOnceWith("/wiki", { scroll: false });
  });
});
