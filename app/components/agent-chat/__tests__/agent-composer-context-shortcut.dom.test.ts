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
vi.mock("../agent-status-announcer", () => ({ AgentInitialProgress: () => null }));
vi.mock("../agent-composer-contexts", () => ({ AgentComposerContexts: () => null }));
vi.mock("../credit-blocked-notice", () => ({ CreditBlockedNotice: () => null }));
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
  it("opens the same controlled context picker without changing the existing draft", () => {
    act(() => root.render(createElement(AgentComposer)));

    const textarea = container.querySelector<HTMLTextAreaElement>('[data-testid="agent-composer"]');
    expect(textarea).not.toBeNull();
    expect(harness.pickerProps?.open).toBe(false);
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);

    const slash = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "/" });
    act(() => {
      textarea?.dispatchEvent(slash);
    });

    expect(slash.defaultPrevented).toBe(true);
    expect(harness.pickerProps?.open).toBe(true);
    expect(harness.pickerProps?.restoreComposerFocusOnEscape).toBe(true);
    expect(textarea?.value).toBe("Keep my draft ");
    expect(harness.store.setComposerDraft).not.toHaveBeenCalled();

    act(() => harness.pickerProps?.onOpenChange(false));
    expect(harness.pickerProps?.open).toBe(false);

    act(() => harness.pickerProps?.onOpenChange(true));
    expect(harness.pickerProps?.restoreComposerFocusOnEscape).toBe(false);
  });
});
