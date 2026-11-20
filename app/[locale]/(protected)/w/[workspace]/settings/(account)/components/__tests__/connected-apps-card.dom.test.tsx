import type { Root } from "react-dom/client";
import type { DeleteConfirmationData } from "@/components/modal/delete-confirmation-modal.store";
import type { ConnectedApp } from "@/features/connected-apps/connected-app.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  rootStore: null as unknown,
  add: vi.fn(),
  disconnect: vi.fn(),
  confirm: vi.fn(),
  open: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: (date: Date) => date.toISOString().slice(0, 10) }),
}));

import { ConnectedAppsCard } from "../connected-apps-card";

const CLAUDE: ConnectedApp = {
  id: "client-claude",
  name: "Claude",
  connectedAt: new Date("2026-10-01T08:00:00.000Z"),
  lastActiveAt: new Date("2026-11-18T16:30:00.000Z"),
};
const CHATGPT: ConnectedApp = {
  id: "client-chatgpt",
  name: "ChatGPT",
  connectedAt: new Date("2026-11-02T08:00:00.000Z"),
  lastActiveAt: new Date("2026-11-03T08:00:00.000Z"),
};

let container: HTMLDivElement;
let root: Root;

async function render(items: ConnectedApp[], canManage = true) {
  harness.rootStore = {
    apiKeyModalStore: { add: harness.add },
    apiKeysStore: { canManage },
    connectedAppsStore: { items, disconnect: harness.disconnect },
    deleteConfirmationModalStore: { onInitOrRefresh: harness.confirm, open: harness.open },
  };
  await act(async () => {
    root.render(createElement(ConnectedAppsCard));
    await Promise.resolve();
  });
}

const rowOf = (id: string) => container.querySelector<HTMLElement>(`[data-connected-app="${id}"]`);
async function click(button: HTMLButtonElement | null | undefined) {
  await act(async () => {
    button?.click();
    await Promise.resolve();
  });
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

describe("ConnectedAppsCard", () => {
  it("lists each connected app with when it was connected and last active", async () => {
    await render([CLAUDE, CHATGPT]);

    expect(container.querySelector("h2")?.textContent).toBe("ConnectedApps.title");
    expect(container.querySelectorAll("[data-connected-app]")).toHaveLength(2);
    expect(rowOf(CLAUDE.id)?.textContent).toContain("Claude");
    expect(rowOf(CLAUDE.id)?.textContent).toContain("ConnectedApps.connectedSince2026-10-01");
    expect(rowOf(CLAUDE.id)?.textContent).toContain("ConnectedApps.lastActive2026-11-18");
    expect(rowOf(CHATGPT.id)?.textContent).toContain("ChatGPT");
    expect(container.querySelector("[data-connected-apps-empty]")).toBeNull();
  });

  it("asks before disconnecting and then revokes exactly that app", async () => {
    harness.disconnect.mockResolvedValue(true);
    await render([CLAUDE, CHATGPT]);

    await click(rowOf(CHATGPT.id)?.querySelector("button"));

    expect(harness.disconnect).not.toHaveBeenCalled();
    expect(harness.open).toHaveBeenCalledTimes(1);
    const confirmation = harness.confirm.mock.calls[0]?.[0] as DeleteConfirmationData;
    expect(confirmation).toMatchObject({
      title: "ConnectedApps.disconnectTitle",
      message: "ConnectedApps.disconnectDescription:ChatGPT",
      confirmLabel: "ConnectedAccountsCard.disconnect",
      confirmVariant: "destructive",
      successKey: "ConnectedApps.toastDisconnected",
    });

    expect(await confirmation.onConfirm()).toBe(true);
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.disconnect).toHaveBeenCalledWith(CHATGPT.id);
  });

  it("says that nothing is connected yet and opens the connect flow", async () => {
    await render([]);

    const empty = container.querySelector<HTMLElement>("[data-connected-apps-empty]");
    expect(empty?.textContent).toContain("ConnectedApps.empty");
    await click(empty?.querySelector("button"));
    expect(harness.add).toHaveBeenCalledTimes(1);
  });

  it("offers no connect button to a member who may not add connections", async () => {
    await render([], false);

    expect(container.querySelector("[data-connected-apps-empty]")?.textContent).toBe("ConnectedApps.empty");
    expect(container.querySelector("button")).toBeNull();
  });
});
