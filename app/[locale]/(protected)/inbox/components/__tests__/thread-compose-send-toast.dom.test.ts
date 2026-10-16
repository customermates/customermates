import type { RootStore } from "@/core/stores/root.store";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

const actions = vi.hoisted(() => ({
  getMessagingThreadAction: vi.fn(),
  discardDraftAction: vi.fn(),
  saveDraftAction: vi.fn(),
  sendChatMessageAction: vi.fn(),
  sendEmailAction: vi.fn(),
  startChatAction: vi.fn(),
}));

vi.mock("../../actions", () => actions);
vi.mock("@/core/errors/report-application-error", async () => {
  const { toast } = await import("sonner");
  return {
    reportApplicationError: (error: unknown, options?: object) =>
      toast.error(error instanceof Error ? error.message : String(error), options),
    runUserAction: (run: () => unknown) => run(),
  };
});
vi.mock("../attachment-input", () => ({
  MAX_ATTACHMENTS_BYTES: 25 * 1024 * 1024,
  toAttachmentInput: vi.fn(),
}));

import { ThreadComposeStore } from "../thread-compose.store";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const THREAD_ID = "00000000-0000-4000-8000-000000000003";
const RECIPIENT = "recipient@example.com";
const SENDING = "Inbox.compose.sendStarted";
const FRAME_MS = 16;

function makeStore() {
  const detail = {
    thread: { id: THREAD_ID, connectedAccountId: ACCOUNT_ID, unipileThreadId: "provider-thread" },
    messages: [] as unknown[],
    appendMessage: vi.fn(),
    replaceMessageById: vi.fn(),
    removeMessageById: vi.fn(),
    setMessageStatus: vi.fn(),
    clearMessageStatus: vi.fn(),
    refresh: vi.fn(() => Promise.resolve()),
  };
  const rootStore = {
    userStore: { user: { id: "compose-owner", companyId: "company" } },
    connectedAccountsStore: { items: [] },
    localeStore: { getTranslation: (key: string) => key },
    messagingThreadDetailStore: detail,
    messagingThreadsStore: { refreshInBackground: vi.fn() },
  } as unknown as RootStore;
  return new ThreadComposeStore(rootStore);
}

const sent = { message: null, messageId: null, threadId: null, providerMessageId: null, repeated: false };
const outcomeUnknown = {
  ok: false,
  error: { errors: ["The provider reported an error, but the message may still have gone out."] },
};

function answerAfter(ms: number, result: unknown) {
  return () => new Promise((resolve) => setTimeout(() => resolve(result), ms));
}

const paths = [
  {
    path: "an email reply",
    action: actions.sendEmailAction,
    result: { ok: true, data: sent },
    shown: "Inbox.compose.messageSentPendingSync",
    compose: (store: ThreadComposeStore) => {
      store.initialize({ provider: MessagingProvider.google, threadId: THREAD_ID, defaultRecipients: [RECIPIENT] });
      store.onChange("body", "Reply text");
    },
  },
  {
    path: "a new email",
    action: actions.sendEmailAction,
    result: outcomeUnknown,
    shown: outcomeUnknown.error.errors[0],
    compose: (store: ThreadComposeStore) => {
      store.initializeNewThread({
        provider: MessagingProvider.google,
        connectedAccountId: ACCOUNT_ID,
        recipients: [{ identifier: RECIPIENT, displayName: null }],
      });
      store.onChange("subject", "New email");
      store.onChange("body", "First words");
    },
  },
  {
    path: "a chat message",
    action: actions.sendChatMessageAction,
    result: { ok: true, data: sent },
    shown: "Inbox.compose.messageSent",
    compose: (store: ThreadComposeStore) => {
      store.initialize({ provider: MessagingProvider.linkedin, threadId: THREAD_ID, defaultRecipients: [RECIPIENT] });
      store.onChange("body", "Chat text");
    },
  },
];

let root: Root;
let container: HTMLDivElement;

function visibleToasts(): string[] {
  return [...document.querySelectorAll("[data-sonner-toast]")]
    .filter((element) => element.getAttribute("data-removed") !== "true")
    .map((element) => element.textContent ?? "");
}

async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(FRAME_MS, ms - elapsed));
    });
  }
}

describe("ThreadComposeStore send result toast", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "Date",
      ],
    });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(createElement(Toaster)));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe.each(paths)("for $path", ({ action, result, shown, compose }) => {
    it.each([1000, 4050, 4150, 6000])("shows the result that arrives %i ms after Send", async (answerMs) => {
      const store = makeStore();
      compose(store);
      action.mockImplementation(answerAfter(answerMs, result));

      let sending!: Promise<void>;
      await act(async () => {
        sending = store.send();
        await Promise.resolve();
      });
      await advance(100);
      expect(visibleToasts()).toEqual([expect.stringContaining(SENDING)]);

      await advance(answerMs - 100 + 1000);
      await act(() => sending);

      expect(action).toHaveBeenCalledOnce();
      expect(visibleToasts()).toEqual([expect.stringContaining(shown)]);
    });
  });
});
