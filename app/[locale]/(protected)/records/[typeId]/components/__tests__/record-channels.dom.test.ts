import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import { observable, runInAction } from "mobx";
import type { RecordEditorStore } from "../record-editor.store";
import { RecordDetailLayoutStore } from "@/core/stores/record-detail-layout.store";
import type { RecordDetailLayoutResult } from "@/features/records/record-detail-layout.schema";

const context = vi.hoisted(() => ({ root: null as unknown as RootStore, composeBody: false }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => context.root }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../contact-compose-popover", () => ({
  ContactComposePopover: () =>
    context.composeBody ? createElement("input", { "aria-label": "Local compose body" }) : null,
}));
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({}));
vi.mock("@/app/actions", () => ({}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { RecordChannels } from "../record-channels";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RecordDetailPersonalization } from "../record-detail-personalization";
import { EntityDetailFields } from "@/components/entity-detail/entity-detail-fields";
import { RecordComposeRecovery } from "@/components/records/record-compose-recovery";
import { NavigationGuardController } from "@/core/stores/navigation-guard.controller";

const roots = new Set<Root>();
beforeEach(() => {
  context.composeBody = false;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function harness() {
  let resolve!: () => void;
  const loaded = new Promise<void>((done) => {
    resolve = done;
  });
  let generation = 0;
  let current = true;
  let canCompose = true;
  const initializeNewThread = vi.fn((_input: { onDone?: () => void }) => {
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
      detachNewThread: vi.fn(),
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
            canCompose: () => canCompose,
            channels: [
              { provider: "mail", value: "person@example.test" },
              { provider: "mail", value: "other@example.test" },
            ],
            canEdit: false,
            remove: vi.fn(),
            addControl: null,
          },
        }),
      ),
    );
    await Promise.resolve();
  });
  const start = async (index = 0) =>
    act(async () => {
      const button = container.querySelectorAll<HTMLButtonElement>('[aria-label="EntityChannels.ariaStartThread"]')[
        index
      ];
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
    container,
    start,
    finish,
    invalidate: () => {
      current = false;
    },
    blockRecordMutation: () => {
      canCompose = false;
    },
  };
}

describe("record channel compose request ownership", () => {
  it("retains clean composition when its opener receives delayed focus, but dismisses unrelated focus", async () => {
    context.composeBody = true;
    const h = await harness();
    const outside = document.createElement("button");
    document.body.append(outside);
    const trigger = h.container.querySelector<HTMLButtonElement>('[aria-label="EntityChannels.ariaStartThread"]');
    if (!trigger) throw new Error("Missing channel compose button");
    await h.start();
    await h.finish();
    const content = document.querySelector<HTMLElement>('[data-slot="popover-content"][data-state="open"]');
    if (!content) throw new Error("Missing channel compose popover");
    const input = content.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("Missing channel compose input");
    expect(h.root.threadComposeStore.initializeNewThread).toHaveBeenCalledOnce();
    await act(async () => {
      input.focus();
      trigger.focus();
      await Promise.resolve();
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[data-slot="popover-content"][data-state="open"]')).toBe(content);
    expect(h.root.threadComposeStore.discardNewThread).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-controls")).toBe(content.id);
    await act(async () => {
      outside.focus();
      await Promise.resolve();
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(h.root.threadComposeStore.discardNewThread).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(outside);
  });

  it("toggles the owned opener once and retains a dirty composition after cancelling close", async () => {
    context.composeBody = true;
    const h = await harness();
    const trigger = h.container.querySelector<HTMLButtonElement>('[aria-label="EntityChannels.ariaStartThread"]');
    if (!trigger) throw new Error("Missing channel compose button");
    await h.start();
    await h.finish();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await h.start();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(h.root.threadComposeStore.discardNewThread).toHaveBeenCalledOnce();
    await h.start();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(h.root.threadComposeStore.initializeNewThread).toHaveBeenCalledTimes(2);
    h.root.threadComposeStore.hasUnsavedChanges = true;
    h.root.navigationGuard.tryNavigate.mockImplementation(() => undefined);
    await h.start();
    expect(h.root.navigationGuard.tryNavigate).toHaveBeenCalledOnce();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(h.root.threadComposeStore.discardNewThread).toHaveBeenCalledOnce();
    await act(async () => {
      h.root.threadComposeStore.initializeNewThread.mock.calls[1][0].onDone?.();
      await Promise.resolve();
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(h.root.threadComposeStore.initializeNewThread).toHaveBeenCalledTimes(2);
  });

  it("guards detached drafts even when permission or sender loss leaves no mounted compose form", () => {
    const guard = new NavigationGuardController();
    const discard = vi.fn();
    const compose = observable({
      isDetachedNewThread: true,
      isLoading: false,
      withUnsavedChangesGuard: true,
      hasUnsavedChanges: true,
      form: { provider: "mail", body: "Keep despite account loss" },
      captureContext: () => () => true,
      discardNewThread: discard,
    });
    context.root = { appMode: "cloud", threadComposeStore: compose, navigationGuard: guard } as unknown as RootStore;
    const container = document.createElement("div");
    document.body.append(container);
    const view = createRoot(container);
    roots.add(view);
    act(() => view.render(createElement(RecordComposeRecovery)));
    const close = document.querySelector('[data-slot="sheet-close"]') as HTMLButtonElement;
    expect(guard.isGuarding).toBe(true);
    act(() => close.click());
    expect(guard.isPending).toBe(true);
    expect(discard).not.toHaveBeenCalled();
    act(() => guard.cancel());
    expect(compose.form.body).toBe("Keep despite account loss");
    act(() => close.click());
    act(() => guard.confirm());
    expect(discard).toHaveBeenCalledOnce();
  });
  it("retains the active Channels field through shared layout refreshes, then applies visibility after completion", () => {
    const initial: RecordDetailLayoutResult = {
      typeId: "10000000-0000-4000-8000-000000000001",
      schemaRevision: 1,
      hasPersonalization: false,
      layout: { pinnedFields: [], hiddenFields: [], fieldOrder: ["system:channels"] },
      fields: [{ id: "system:channels", label: "Channels" }],
    };
    const layout = new RecordDetailLayoutStore(initial);
    const owned = observable({ active: true });
    const editor = {
      presentation: { detailLayout: initial },
      record: {},
      rootStore: { recordWorkspaceStore: { getDetailLayout: () => layout } },
      get hasRelatedDraft() {
        return owned.active;
      },
    } as unknown as RecordEditorStore;
    const container = document.createElement("div");
    document.body.append(container);
    const view = createRoot(container);
    roots.add(view);
    act(() => {
      view.render(
        createElement(
          RecordDetailPersonalization,
          { store: editor },
          createElement(EntityDetailFields, {
            fields: [
              {
                id: "system:channels",
                label: "Channels",
                content: createElement("input", { "aria-label": "Owned compose draft", defaultValue: "" }),
              },
            ],
          }),
        ),
      );
    });
    const input = container.querySelector("input") as HTMLInputElement;
    input.value = "Keep my channel draft";
    act(() => {
      layout.hydrate({ ...initial, layout: { ...initial.layout, hiddenFields: ["system:channels"] }, fields: [] });
    });
    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("Keep my channel draft");
    act(() => {
      runInAction(() => {
        owned.active = false;
      });
    });
    expect(container.querySelector("input")).toBeNull();
    layout.dispose();
  });
  it("does not initialize a recipient when its record mutation begins during account loading", async () => {
    const h = await harness();
    await h.start();
    h.blockRecordMutation();
    await h.finish();
    expect(h.root.threadComposeStore.initializeNewThread).not.toHaveBeenCalled();
    expect(h.root.navigationGuard.tryNavigate).not.toHaveBeenCalled();
  });
  it("still completes the active compose after canceling a switch to another channel", async () => {
    const h = await harness();
    await h.start();
    await h.finish();
    const original = h.root.threadComposeStore.initializeNewThread.mock.calls[0][0];
    h.root.threadComposeStore.hasUnsavedChanges = true;
    h.root.navigationGuard.tryNavigate.mockImplementation(() => undefined);
    await h.start(1);
    expect(h.root.navigationGuard.tryNavigate).toHaveBeenCalledTimes(1);
    expect(h.root.threadComposeStore.initializeNewThread).toHaveBeenCalledTimes(1);
    await act(async () => {
      original.onDone?.();
      await Promise.resolve();
    });
    expect(document.querySelector('[aria-label="EntityChannels.ariaStartThread"][aria-expanded="true"]')).toBeNull();
  });

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
    h.root.threadComposeStore.initializeNewThread({});
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
