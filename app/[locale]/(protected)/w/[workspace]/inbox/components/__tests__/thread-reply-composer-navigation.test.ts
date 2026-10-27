import type { Root } from "react-dom/client";
import type { NewThreadTarget } from "../thread-compose.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingProvider } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  initialize: vi.fn(),
  initializeNewThread: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({ observer: <Component>(component: Component) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: harness.replace }),
  usePathname: () => "/inbox",
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({ useHydratedIntlStore: () => ({}) }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    userStore: { can: () => false },
    threadComposeStore: {
      form: { threadId: "" },
      initialize: harness.initialize,
      initializeNewThread: harness.initializeNewThread,
    },
    connectedAccountsStore: {},
  }),
}));

import { ThreadReplyComposer } from "../thread-reply-composer";

const SOURCE_THREAD_ID = "00000000-0000-4000-8000-000000000001";
const SENT_THREAD_ID = "00000000-0000-4000-8000-000000000002";
const target: NewThreadTarget = {
  connectedAccountId: "00000000-0000-4000-8000-000000000003",
  draftThreadId: SOURCE_THREAD_ID,
  recipients: [{ identifier: "recipient@example.com", displayName: null }],
};
let root: Root | null = null;

function render(newThreadTarget: NewThreadTarget | null = target) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(ThreadReplyComposer, {
        threadId: SOURCE_THREAD_ID,
        provider: MessagingProvider.google,
        newThreadTarget,
      }),
    ),
  );
}

function sentCallback(): (threadId: string | null) => void {
  const input = harness.initializeNewThread.mock.calls.at(-1)?.[0] as
    | { onSent?: (threadId: string | null) => void }
    | undefined;
  if (!input?.onSent) throw new Error("Expected a draft-send completion callback");
  return input.onSent;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  window.history.replaceState({}, "", `/en/inbox?threadId=${SOURCE_THREAD_ID}&state=open`);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("ThreadReplyComposer draft-send navigation", () => {
  it("replaces a consumed draft route with its canonical thread and preserves the latest filters", () => {
    render();
    window.history.replaceState({}, "", `/en/inbox?threadId=${SOURCE_THREAD_ID}&state=closed`);
    sentCallback()(SENT_THREAD_ID);

    expect(harness.replace).toHaveBeenCalledExactlyOnceWith(`/inbox?threadId=${SENT_THREAD_ID}&state=closed`, {
      scroll: false,
    });
  });

  it("returns to the inbox when a successful send has not adopted a canonical thread yet", () => {
    render();
    sentCallback()(null);
    expect(harness.replace).toHaveBeenCalledExactlyOnceWith("/inbox?state=open", { scroll: false });
  });

  it("does not leave a trailing query delimiter when removing the only query parameter", () => {
    window.history.replaceState({}, "", `/en/inbox?threadId=${SOURCE_THREAD_ID}`);
    render();
    sentCallback()(null);
    expect(harness.replace).toHaveBeenCalledExactlyOnceWith("/inbox", { scroll: false });
  });

  it.each([`/en/inbox?threadId=${SENT_THREAD_ID}`, `/en/contacts?threadId=${SOURCE_THREAD_ID}`])(
    "does not navigate after the user moves to %s",
    (href) => {
      render();
      window.history.replaceState({}, "", href);
      sentCallback()(SENT_THREAD_ID);
      expect(harness.replace).not.toHaveBeenCalled();
    },
  );

  it("does not navigate after the composer unmounts", () => {
    render();
    const onSent = sentCallback();
    act(() => root?.unmount());
    root = null;
    onSent(SENT_THREAD_ID);
    expect(harness.replace).not.toHaveBeenCalled();
  });

  it("does not register cold-send navigation for an existing reply", () => {
    render(null);
    expect(harness.initializeNewThread).not.toHaveBeenCalled();
    expect(harness.initialize).toHaveBeenCalledWith(expect.objectContaining({ threadId: SOURCE_THREAD_ID }));
  });
});
