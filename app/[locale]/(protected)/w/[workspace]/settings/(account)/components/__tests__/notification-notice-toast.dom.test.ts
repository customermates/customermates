import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ search: "", success: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(harness.search) }));
vi.mock("sonner", () => ({ toast: { success: harness.success } }));

import { NotificationNoticeToast } from "../notification-notice-toast";

let container: HTMLDivElement;
let root: Root;

const KINDS = ["dueToday", "replyReceived", "ruleAlert"] as const;

async function renderToast(search: string, offKinds: readonly string[] = KINDS) {
  harness.search = search;
  window.history.replaceState(null, "", search ? `/settings/profile?${search}` : "/settings/profile");
  const preferences = KINDS.map((kind) => ({
    kind,
    emailMode: offKinds.includes(kind) ? ("off" as const) : ("digest" as const),
  }));
  await act(async () => {
    root.render(createElement(NotificationNoticeToast, { preferences }));
    await Promise.resolve();
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("NotificationNoticeToast", () => {
  it("tells the person which kind a turn-off link switched off and cleans the address", async () => {
    await renderToast("notice=notification-kind-off&kind=ruleAlert&x=1");

    expect(harness.success).toHaveBeenCalledWith(
      "Notifications.preferences.kindOffNotice:Notifications.kinds.ruleAlert",
    );
    expect(window.location.search).toBe("?x=1");
  });

  it("names each of the three kinds", async () => {
    for (const kind of ["dueToday", "replyReceived", "ruleAlert"]) {
      harness.success.mockClear();
      await renderToast(`notice=notification-kind-off&kind=${kind}`);
      expect(harness.success).toHaveBeenCalledWith(
        `Notifications.preferences.kindOffNotice:Notifications.kinds.${kind}`,
      );
    }
  });

  it("says nothing when the kind in the address is not switched off in this person's own settings", async () => {
    await renderToast("notice=notification-kind-off&kind=ruleAlert", ["dueToday"]);

    expect(harness.success).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("says nothing for another notice, an unknown kind or a plain visit", async () => {
    await renderToast("notice=other&kind=ruleAlert");
    await renderToast("notice=notification-kind-off&kind=everything");
    await renderToast("");

    expect(harness.success).not.toHaveBeenCalled();
  });
});
