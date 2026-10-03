import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";

const context = vi.hoisted(() => ({ root: null as unknown as RootStore }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => context.root }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../contact-compose-popover", () => ({ ContactComposePopover: () => null }));

import { RecordChannels } from "../record-channels";
import { TooltipProvider } from "@/components/ui/tooltip";

const roots = new Set<Root>();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.innerHTML = "";
});

async function harness() {
  let resolve!: () => void;
  const loaded = new Promise<void>((done) => {
    resolve = done;
  });
  let generation = 0;
  let current = true;
  const initializeNewThread = vi.fn(() => {
    generation += 1;
  });
  const root = {
    appMode: "cloud",
    userStore: { user: { id: "actor" }, can: vi.fn(() => true), canAccess: vi.fn(() => true) },
    connectedAccountsStore: {
      ensureLoaded: vi.fn(() => loaded),
      usableSendersFor: vi.fn(() => [{ id: "account" }]),
    },
    threadComposeStore: {
      isLoading: false,
      hasUnsavedChanges: false,
      initializeNewThread,
      discardNewThread: vi.fn(),
      captureContext: () => {
        const captured = generation;
        return () => captured === generation;
      },
    },
    navigationGuard: { tryNavigate: vi.fn((navigate: () => void) => navigate()) },
  };
  context.root = root as unknown as RootStore;
  const container = document.createElement("div");
  document.body.append(container);
  const view = createRoot(container);
  roots.add(view);
  await act(async () => {
    view.render(
      createElement(
        TooltipProvider,
        null,
        createElement(RecordChannels, {
          recordChannels: {
            contextKey: "record:1",
            captureContext: () => () => current,
            channels: [{ provider: "mail", value: "person@example.test" }],
            canEdit: false,
            remove: vi.fn(),
            addControl: null,
          },
        }),
      ),
    );
    await Promise.resolve();
  });
  const start = async () =>
    act(async () => {
      const button = container.querySelector<HTMLButtonElement>('[aria-label="EntityChannels.ariaStartThread"]');
      if (!button) throw new Error("Missing channel compose button");
      button.click();
      await Promise.resolve();
    });
  const finish = async () =>
    act(async () => {
      resolve();
      await loaded;
    });
  return {
    root,
    view,
    start,
    finish,
    invalidate: () => {
      current = false;
    },
  };
}

describe("record channel compose request ownership", () => {
  it("does not open a channel after its record session closes", async () => {
    const h = await harness();
    await h.start();
    h.invalidate();
    await h.finish();
    expect(h.root.threadComposeStore.initializeNewThread).not.toHaveBeenCalled();
  });

  it("does not replace a newer global compose session after account loading", async () => {
    const h = await harness();
    await h.start();
    h.root.threadComposeStore.initializeNewThread();
    await h.finish();
    expect(h.root.threadComposeStore.initializeNewThread).toHaveBeenCalledTimes(1);
    expect(h.root.navigationGuard.tryNavigate).not.toHaveBeenCalled();
  });

  it("does not initialize a channel after its component unmounts", async () => {
    const h = await harness();
    await h.start();
    act(() => h.view.unmount());
    roots.delete(h.view);
    await h.finish();
    expect(h.root.threadComposeStore.initializeNewThread).not.toHaveBeenCalled();
  });

  it("rechecks an inbox grant before initializing the recipient", async () => {
    const h = await harness();
    await h.start();
    h.root.userStore.can.mockReturnValue(false);
    await h.finish();
    expect(h.root.threadComposeStore.initializeNewThread).not.toHaveBeenCalled();
  });
});
