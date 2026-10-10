import type { Root } from "react-dom/client";
import type { EntityDetailPanelLayout } from "../entity-detail-panels";

import { act, createElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsertP13nAction = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions", () => ({ upsertP13nAction }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { EntityDetailPanels } from "../entity-detail-panels";

const LAYOUT_ID = "details-notes-activities";
const STORED = {
  [`panel:${LAYOUT_ID}:details`]: 500,
  [`panel:${LAYOUT_ID}:notes`]: 250,
  [`panel:${LAYOUT_ID}:activities`]: 250,
  "panel:details-notes:details": 700,
};
const STORED_TEMPLATE = "minmax(320px, 500fr) 1px minmax(280px, 250fr) 1px minmax(320px, 250fr)";

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function rect(width: number): DOMRect {
  return { bottom: 100, height: 100, left: 0, right: width, top: 0, width, x: 0, y: 0, toJSON: () => ({}) };
}

function view(panelLayout: EntityDetailPanelLayout) {
  return createElement(EntityDetailPanels, {
    activities: createElement("p", null, "Activities"),
    details: createElement("p", null, "Details"),
    notes: createElement("p", null, "Notes"),
    panelLayout,
  });
}

function container() {
  const element = document.createElement("div");
  document.body.append(element);
  containers.push(element);
  return element;
}

function grid(element: HTMLElement) {
  const group = element.querySelector<HTMLElement>("[data-detail-grid]");
  if (!group) throw new Error("Expected the detail grid");
  return group;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  upsertP13nAction.mockReset();
  upsertP13nAction.mockResolvedValue({ ok: true, data: {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function panelRect(this: HTMLElement) {
    const panel = this.getAttribute("data-detail-panel");
    if (panel === "details") return rect(600);
    if (panel === "notes") return rect(400);
    if (panel === "activities") return rect(360);
    return rect(0);
  });
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const element of containers.splice(0)) element.remove();
  vi.restoreAllMocks();
});

describe("EntityDetailPanels resizable layout", () => {
  it("hydrates the stored three-panel widths without a server/client mismatch", async () => {
    const panelLayout = { initial: STORED, p13nId: "record-panels:type-1", persistenceScope: "user-hydrate" };
    const element = container();
    element.innerHTML = renderToString(view(panelLayout));
    expect(grid(element).style.getPropertyValue("--panel-grid-template")).toBe(STORED_TEMPLATE);

    const recoverable = vi.fn();
    await act(async () => {
      roots.push(hydrateRoot(element, view(panelLayout), { onRecoverableError: recoverable }));
      await Promise.resolve();
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(grid(element).style.getPropertyValue("--panel-grid-template")).toBe(STORED_TEMPLATE);
    expect(element.querySelectorAll('[role="separator"]')).toHaveLength(2);
    expect(upsertP13nAction).not.toHaveBeenCalled();
  });

  it("persists a resize under the layout personalization key and keeps other layouts", async () => {
    const element = container();
    const root = createRoot(element);
    roots.push(root);
    await act(async () => {
      root.render(view({ initial: STORED, p13nId: "record-panels:type-1", persistenceScope: "user-persist" }));
      await Promise.resolve();
    });

    const handle = element.querySelector<HTMLElement>('[role="separator"]');
    if (!handle) throw new Error("Expected a resize handle");
    await act(async () => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight", shiftKey: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(upsertP13nAction).toHaveBeenCalledTimes(1);
    const saved = upsertP13nAction.mock.calls[0]?.[0] as { p13nId: string; columnWidths: Record<string, number> };
    expect(saved.p13nId).toBe("record-panels:type-1");
    expect(saved.columnWidths["panel:details-notes:details"]).toBe(700);
    const details = saved.columnWidths[`panel:${LAYOUT_ID}:details`] ?? 0;
    const notes = saved.columnWidths[`panel:${LAYOUT_ID}:notes`] ?? 0;
    const activities = saved.columnWidths[`panel:${LAYOUT_ID}:activities`] ?? 0;
    expect(details).toBeGreaterThan(600 / 1.36);
    expect(notes).toBeLessThan(400 / 1.36);
    expect(activities).toBeCloseTo(360 / 1.36, 0);
    expect(grid(element).style.getPropertyValue("--panel-grid-template")).not.toBe(STORED_TEMPLATE);
  });

  it("keeps demo resizing local without a personalization write", async () => {
    const element = container();
    const root = createRoot(element);
    roots.push(root);
    await act(async () => {
      root.render(view({ initial: STORED, p13nId: undefined, persistenceScope: "user-demo" }));
      await Promise.resolve();
    });

    const handle = element.querySelector<HTMLElement>('[role="separator"]');
    if (!handle) throw new Error("Expected a resize handle");
    await act(async () => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight", shiftKey: true }));
      await Promise.resolve();
    });

    expect(upsertP13nAction).not.toHaveBeenCalled();
    expect(grid(element).style.getPropertyValue("--panel-grid-template")).not.toBe(STORED_TEMPLATE);
  });
});
