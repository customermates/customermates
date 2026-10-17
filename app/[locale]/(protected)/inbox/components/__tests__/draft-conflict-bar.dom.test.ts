import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("mobx-react-lite", () => ({ observer: <Component>(component: Component) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/errors/report-application-error", () => ({ runUserAction: (run: () => unknown) => run() }));

import { DraftConflictBar } from "../draft-conflict-bar";

type BarStore = { draftConflict: boolean; isLoading: boolean; resolveDraftConflict: (choice: string) => void };

let root: Root | null = null;

function render(store: BarStore, senderUnavailable = false) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(DraftConflictBar, { store: store as never, senderUnavailable })));
  return container;
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find((element) => element.textContent === label);
  if (!match) throw new Error(`Expected a button labelled ${label}`);
  return match;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe("DraftConflictBar", () => {
  it("renders nothing while the draft has no conflict", () => {
    const container = render({ draftConflict: false, isLoading: false, resolveDraftConflict: vi.fn() });

    expect(container.childElementCount).toBe(0);
  });

  it("announces the conflict as a warning status and resolves it with the chosen version", () => {
    const store = { draftConflict: true, isLoading: false, resolveDraftConflict: vi.fn() };
    const container = render(store);

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain("Inbox.compose.draftChangedNotice");
    expect(status?.className).toContain("bg-warning/10");
    expect(container.querySelector('[role="alert"]')).toBeNull();

    act(() => button(container, "Inbox.compose.loadLatestDraft").click());
    act(() => button(container, "Inbox.compose.sendMyDraft").click());

    expect(store.resolveDraftConflict.mock.calls).toEqual([["latest"], ["mine"]]);
  });

  it.each([
    ["while the latest version loads", true, false, [true, true]],
    ["without a usable sender", false, true, [false, true]],
  ])("disables the choices %s", (_label, isLoading, senderUnavailable, [latestDisabled, mineDisabled]) => {
    const container = render({ draftConflict: true, isLoading, resolveDraftConflict: vi.fn() }, senderUnavailable);

    expect(button(container, "Inbox.compose.loadLatestDraft").disabled).toBe(latestDisabled);
    expect(button(container, "Inbox.compose.sendMyDraft").disabled).toBe(mineDisabled);
  });
});
