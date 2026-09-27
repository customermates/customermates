// @vitest-environment jsdom

import type { RootStore } from "@/core/stores/root.store";

import { reaction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentUiControlStore } from "@/app/components/agent-chat/ui-control.store";

const DESKTOP_PANEL_RECT = new DOMRect(1024, 324, 400, 560);
const TABLET_PANEL_RECT = new DOMRect(384, 448, 400, 560);

function laidOut(element: HTMLElement, rect: DOMRect) {
  element.getClientRects = () => [rect] as unknown as DOMRectList;
  element.getBoundingClientRect = () => rect;
}

function control(id: string, rect: DOMRect) {
  const element = document.createElement("button");
  element.id = id;
  element.scrollIntoView = vi.fn();
  laidOut(element, rect);
  document.body.append(element);
  return element;
}

function assistantPanel(rect = DESKTOP_PANEL_RECT) {
  const panel = document.createElement("div");
  panel.id = "agent-panel-dialog";
  panel.setAttribute("data-agent-surface", "");
  laidOut(panel, rect);
  document.body.append(panel);
  return panel;
}

function controlStore() {
  return new AgentUiControlStore({
    appMode: "cloud",
    userStore: { canAccess: () => true },
  } as unknown as RootStore);
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("AgentUiControlStore beside the assistant panel", () => {
  it("reports a highlight whose target sits behind the assistant panel instead of claiming it", async () => {
    assistantPanel();
    control("connected-account-email-save", new DOMRect(1054, 827, 153, 32));
    const store = controlStore();

    const result = await store.highlight("connected-account-email-save");

    expect(result.ok).toBe(false);
    expect(result.result).toContain("behind the assistant panel");
    expect(store.active).toBeNull();
  });

  it("reports a tour whose first stop sits behind the assistant panel", async () => {
    assistantPanel(TABLET_PANEL_RECT);
    control("invite-modal-emails", new DOMRect(192, 460, 416, 32));
    const store = controlStore();

    const result = await store.startGuidedTour([{ targetId: "invite-modal-emails", note: "Type the emails." }]);

    expect(result.ok).toBe(false);
    expect(result.result).toContain("invite-modal-emails");
    expect(result.result).toContain("behind the assistant panel");
    expect(store.active).toBeNull();
  });

  it("skips a tour stop reached with Next or Back that sits behind the assistant panel", async () => {
    assistantPanel();
    control("connected-account-signature", new DOMRect(600, 500, 40, 20));
    control("connected-account-email-save", new DOMRect(1054, 827, 153, 32));
    control("connected-account-visibility", new DOMRect(600, 560, 40, 20));
    const store = controlStore();
    const shown: string[] = [];
    const stopRecording = reaction(
      () => store.active?.targetId,
      (targetId) => {
        if (targetId) shown.push(targetId);
      },
    );

    const result = await store.startGuidedTour([
      { targetId: "connected-account-signature", note: "Turn on the signature." },
      { targetId: "connected-account-email-save", note: "Save the email settings." },
      { targetId: "connected-account-visibility", note: "Share the account." },
    ]);
    expect(result.ok).toBe(true);

    store.nextStep();
    await vi.waitFor(() => expect(store.active?.targetId).toBe("connected-account-visibility"));
    expect(store.active?.stepIndex).toBe(2);

    store.previousStep();
    await vi.waitFor(() => expect(store.active?.targetId).toBe("connected-account-signature"));

    stopRecording();
    expect(shown).not.toContain("connected-account-email-save");
    store.end();
  });

  it("ends the tour when the last stop reached with Next sits behind the assistant panel", async () => {
    assistantPanel();
    control("connected-account-signature", new DOMRect(600, 500, 40, 20));
    control("connected-account-email-save", new DOMRect(1054, 827, 153, 32));
    const store = controlStore();
    const shown: string[] = [];
    const stopRecording = reaction(
      () => store.active?.targetId,
      (targetId) => {
        if (targetId) shown.push(targetId);
      },
    );

    const result = await store.startGuidedTour([
      { targetId: "connected-account-signature", note: "Turn on the signature." },
      { targetId: "connected-account-email-save", note: "Save the email settings." },
    ]);
    expect(result.ok).toBe(true);

    store.nextStep();
    await vi.waitFor(() => expect(store.active).toBeNull());

    stopRecording();
    expect(shown).toEqual(["connected-account-signature"]);
  });

  it("still highlights a target beside the assistant panel", async () => {
    assistantPanel();
    control("company-members-add", new DOMRect(600, 120, 80, 32));
    const store = controlStore();

    await expect(store.highlight("company-members-add")).resolves.toEqual({
      ok: true,
      result: "Highlighted company-members-add.",
    });
    expect(store.active?.targetId).toBe("company-members-add");
    store.end();
  });

  it("still highlights a target when the assistant panel is closed", async () => {
    control("connected-account-email-save", new DOMRect(1054, 827, 153, 32));
    const store = controlStore();

    await expect(store.highlight("connected-account-email-save")).resolves.toMatchObject({ ok: true });
    store.end();
  });
});
