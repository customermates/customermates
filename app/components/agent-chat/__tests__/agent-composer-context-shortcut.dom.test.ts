import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  pickerProps: null as null | {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    restoreComposerFocusOnEscape: boolean;
  },
  store: {} as Record<string, unknown>,
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T>(component: T) => component,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => action(),
}));
vi.mock("@/core/utils/background-task.service", () => ({}));
vi.mock("@/app/[locale]/(protected)/inbox/components/message-date-separator", () => ({
  MessageDateSeparator: () => null,
  isSameDay: () => false,
}));
vi.mock("@/components/scroll/messages-scroll-container", () => ({
  MessagesScrollContainer: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../agent-chat-store-context", () => ({
  useAgentChatStore: () => harness.store,
  useAgentChatUiTargets: () => ({
    composerId: "agent-composer",
    fallbackFocusId: "agent-panel-dialog",
    usageId: "agent-usage",
  }),
}));
vi.mock("../agent-context-picker", () => ({
  AgentContextPicker: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    restoreComposerFocusOnEscape: boolean;
  }) => {
    harness.pickerProps = props;
    return null;
  },
}));
vi.mock("../chat-ui", () => ({
  ActionTooltip: ({ children }: { children: ReactNode }) => children,
  chatUiCopy: () => ({}),
}));
vi.mock("../agent-chat-items", () => ({
  AgentActivity: () => null,
  AgentChatItemView: () => null,
  consecutiveActivityItems: () => [],
  isWorkingActivityGroup: () => false,
}));
vi.mock("../agent-status-announcer", () => ({
  AgentInitialProgress: () => null,
}));
vi.mock("../agent-composer-contexts", () => ({
  AgentComposerContexts: () => null,
}));
vi.mock("../credit-blocked-notice", () => ({
  CreditBlockedNotice: () => null,
}));
vi.mock("../queued-prompt", () => ({ QueuedPrompt: () => null }));
vi.mock("../usage-ring", () => ({ UsageRing: () => null }));

import { AgentComposer } from "../agent-conversation";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.pickerProps = null;
  harness.store = {
    composerContexts: [],
    composerDraft: "Keep my draft ",
    isWorking: false,
    queuedPrompt: null,
    removeComposerContext: vi.fn(),
    setComposerDraft: vi.fn(),
    submitDraft: vi.fn(),
    usage: null,
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe("AgentComposer context shortcut", () => {
  it("opens the same controlled context picker without changing the existing draft", async () => {
    act(() => root.render(createElement(AgentComposer)));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    const editor = container.querySelector<HTMLElement>('[data-testid="agent-composer-input-line"] [role="textbox"]');
    expect(editor).not.toBeNull();
    expect(harness.pickerProps?.open).toBe(false);
    expect(editor?.textContent).toBe("Keep my draft ");

    const slash = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "/",
    });
    act(() => {
      editor?.dispatchEvent(slash);
    });

    expect(slash.defaultPrevented).toBe(true);
    expect(harness.pickerProps?.open).toBe(true);
    expect(harness.pickerProps?.restoreComposerFocusOnEscape).toBe(true);
    expect(editor?.textContent).toBe("Keep my draft ");
    expect(harness.store.setComposerDraft).not.toHaveBeenCalled();

    act(() => harness.pickerProps?.onOpenChange(false));
    expect(harness.pickerProps?.open).toBe(false);

    act(() => harness.pickerProps?.onOpenChange(true));
    expect(harness.pickerProps?.restoreComposerFocusOnEscape).toBe(false);
  });

  it("keeps plain text editing, line breaks, and submit behavior inside the inline editor", async () => {
    act(() => root.render(createElement(AgentComposer)));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    const inputLine = container.querySelector<HTMLElement>('[data-testid="agent-composer-input-line"]');
    const editor = inputLine?.querySelector<HTMLElement>('[role="textbox"]');
    expect(inputLine?.className).not.toContain("flex-wrap");
    expect(editor?.className).toContain("agent-composer-editor inline");
    expect(editor?.getAttribute("contenteditable")).toBe("true");
    expect(editor?.getAttribute("aria-multiline")).toBe("true");

    const lineBreak = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      shiftKey: true,
    });
    act(() => {
      editor?.dispatchEvent(lineBreak);
    });
    expect(lineBreak.defaultPrevented).toBe(true);
    expect(harness.store.setComposerDraft).toHaveBeenCalledWith("Keep my draft \n");
    expect(harness.store.submitDraft).not.toHaveBeenCalled();

    const submit = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });
    act(() => {
      editor?.dispatchEvent(submit);
    });
    expect(submit.defaultPrevented).toBe(true);
    expect(harness.store.submitDraft).toHaveBeenCalledOnce();
  });

  it("pastes markup as literal plain text", async () => {
    act(() => root.render(createElement(AgentComposer)));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    const editor = container.querySelector<HTMLElement>('[data-testid="agent-composer-input-line"] [role="textbox"]');
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: () => "<strong>plain</strong>" },
    });
    act(() => {
      editor?.dispatchEvent(paste);
    });

    expect(paste.defaultPrevented).toBe(true);
    expect(editor?.querySelector("strong")).toBeNull();
    expect(editor?.textContent).toBe("Keep my draft <strong>plain</strong>");
    expect(harness.store.setComposerDraft).toHaveBeenCalledWith("Keep my draft <strong>plain</strong>");
  });

  it("appends after a controlled starter draft injected after mount", async () => {
    harness.store.composerDraft = "";
    act(() => root.render(createElement(AgentComposer)));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    harness.store.composerDraft = "Injected starter ";
    act(() => root.render(createElement(AgentComposer)));

    const editor = container.querySelector<HTMLElement>('[data-testid="agent-composer-input-line"] [role="textbox"]');
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: () => "details" },
    });
    act(() => {
      editor?.dispatchEvent(paste);
    });

    expect(editor?.textContent).toBe("Injected starter details");
    expect(harness.store.setComposerDraft).toHaveBeenCalledWith("Injected starter details");
  });

  it("does not erase a selected draft when the clipboard has no plain text", async () => {
    act(() => root.render(createElement(AgentComposer)));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    const editor = container.querySelector<HTMLElement>('[data-testid="agent-composer-input-line"] [role="textbox"]');
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: () => "" },
    });
    act(() => {
      editor?.dispatchEvent(paste);
    });

    expect(paste.defaultPrevented).toBe(true);
    expect(editor?.textContent).toBe("Keep my draft ");
    expect(harness.store.setComposerDraft).not.toHaveBeenCalled();
  });

  it("renders an inline placeholder when the controlled draft is empty", () => {
    harness.store.composerDraft = "";
    act(() => root.render(createElement(AgentComposer)));

    const placeholder = container.querySelector<HTMLElement>('[data-testid="agent-composer-placeholder"]');
    const editor = container.querySelector<HTMLElement>('[role="textbox"]');
    expect(placeholder?.textContent).toBe("AgentChat.placeholder");
    expect(editor?.getAttribute("aria-placeholder")).toBe("AgentChat.placeholder");
  });
});
