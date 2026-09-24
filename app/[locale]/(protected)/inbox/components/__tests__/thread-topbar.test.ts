import type { ReactElement } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  canUpdate: true,
  setActions: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    layoutStore: { clearRuntimeIdentity: vi.fn(), setRuntimeIdentity: vi.fn() },
    messagingThreadDetailStore: { resyncThread: vi.fn() },
    userStore: { can: () => harness.canUpdate },
  }),
}));

vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActionsOverride: harness.setActions,
}));

vi.mock("@/ee/messaging/thread-display", () => ({
  deriveThreadDisplay: () => ({ avatarUrl: null, displayName: "Ada Lovelace" }),
}));

vi.mock("../thread-folder-chip", () => ({
  ThreadFolderChip: () => createElement("span", { "data-folder-chip": true }),
}));

vi.mock("../thread-settings", () => ({
  ThreadSettings: () => createElement("span", { "data-thread-settings": true }),
}));

vi.mock("../thread-state-picker", () => ({
  ThreadStatePicker: () => createElement("span", { "data-state-picker": true }),
}));

import { ThreadTopBar } from "../thread-topbar";

function renderActions() {
  renderToStaticMarkup(
    createElement(ThreadTopBar, {
      thread: {
        id: "thread-1",
        accountShared: false,
        isOwner: true,
        participants: [],
        provider: "google",
        sharedToCrm: false,
        state: "open",
      } as never,
    }),
  );

  return renderToStaticMarkup(harness.setActions.mock.lastCall?.[0] as ReactElement);
}

describe("ThreadTopBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.canUpdate = true;
  });

  it("names the icon-only resync button", () => {
    const html = renderActions();
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];

    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toContain('aria-label="Inbox.resyncThread"');
  });

  it("leaves the resync button out without update permission", () => {
    harness.canUpdate = false;

    expect(renderActions()).not.toContain("<button");
  });
});
