import { afterEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";

import { AgentUiControlStore } from "../ui-control.store";

class FakeElement {
  tagName = "BUTTON";
  isConnected = true;
  hidden = false;
  disabled = false;
  attributes = new Map<string, string>();
  click = vi.fn();
  scrollIntoView = vi.fn();
  closest = vi.fn().mockReturnValue(null);
  getClientRects = vi.fn().mockReturnValue([{}]);

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
}

function controlStore() {
  return new AgentUiControlStore({} as RootStore);
}

function mount(elements: Record<string, FakeElement>, style: Record<string, string> = {}) {
  vi.stubGlobal("window", {
    getComputedStyle: () => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      pointerEvents: "auto",
      ...style,
    }),
  });
  vi.stubGlobal("document", {
    getElementById: (id: string) => elements[id] ?? null,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AgentUiControlStore.clickTarget", () => {
  it("activates an allowlisted display control only after its expanded state is visible", async () => {
    const target = new FakeElement();
    target.setAttribute("aria-expanded", "false");
    target.click.mockImplementation(() => target.setAttribute("aria-expanded", "true"));
    mount({ "deals-display-options": target });

    await expect(controlStore().clickTarget("deals-display-options")).resolves.toEqual({
      ok: true,
      result: "Activated deals-display-options.",
    });
    expect(target.scrollIntoView).toHaveBeenCalledOnce();
    expect(target.click).toHaveBeenCalledOnce();
  });

  it("requires the display-options prerequisite before a layout control can be used", async () => {
    mount({});

    await expect(controlStore().clickTarget("deals-layout-board")).resolves.toEqual({
      ok: false,
      result: "Target deals-layout-board is not available. Open deals-display-options first.",
    });
  });

  it("treats an already selected layout as a successful no-op", async () => {
    const target = new FakeElement();
    target.setAttribute("data-state", "active");
    mount({ "deals-layout-table": target });

    await expect(controlStore().clickTarget("deals-layout-table")).resolves.toEqual({
      ok: true,
      result: "Target deals-layout-table is already active.",
    });
    expect(target.click).not.toHaveBeenCalled();
  });

  it.each([
    ["arbitrary selectors", "#deals-display-options"],
    ["form submission controls", "company-settings-save"],
    ["navigation controls", "nav-contacts"],
  ])("rejects %s outside the click allowlist", async (_label, targetId) => {
    mount({});

    await expect(controlStore().clickTarget(targetId)).resolves.toEqual({
      ok: false,
      result: `Target ${targetId} is not an allowed interface control.`,
    });
  });

  it.each([
    ["disabled", { disabled: true }],
    ["hidden", { hidden: true }],
    ["disconnected", { isConnected: false }],
  ])("rejects a %s button without clicking it", async (state, overrides) => {
    const target = Object.assign(new FakeElement(), overrides);
    target.setAttribute("aria-expanded", "false");
    mount({ "deals-display-options": target });

    const outcome = await controlStore().clickTarget("deals-display-options");

    expect(outcome.ok).toBe(false);
    expect(outcome.result).toContain(state === "disabled" ? "disabled" : "not visible");
    expect(target.click).not.toHaveBeenCalled();
  });

  it("rejects inert ancestors and non-button targets", async () => {
    const inert = new FakeElement();
    inert.closest.mockReturnValue({});
    inert.setAttribute("aria-expanded", "false");
    mount({ "deals-display-options": inert });
    await expect(controlStore().clickTarget("deals-display-options")).resolves.toMatchObject({
      ok: false,
      result: "Target deals-display-options is not visible.",
    });

    const input = new FakeElement();
    input.tagName = "INPUT";
    mount({ "deals-display-options": input });
    await expect(controlStore().clickTarget("deals-display-options")).resolves.toEqual({
      ok: false,
      result: "Target deals-display-options is not an activatable button.",
    });
  });

  it.each([
    ["transparent", { opacity: "0" }],
    ["non-interactive", { pointerEvents: "none" }],
  ])("rejects a %s computed style", async (_state, style) => {
    const target = new FakeElement();
    target.setAttribute("aria-expanded", "false");
    mount({ "deals-display-options": target }, style);

    await expect(controlStore().clickTarget("deals-display-options")).resolves.toEqual({
      ok: false,
      result: "Target deals-display-options is not visible.",
    });
    expect(target.click).not.toHaveBeenCalled();
  });

  it("reports failure when a click does not reach its required postcondition", async () => {
    vi.useFakeTimers();
    const target = new FakeElement();
    target.setAttribute("data-state", "inactive");
    mount({ "deals-layout-board": target });

    const outcome = controlStore().clickTarget("deals-layout-board");
    await vi.advanceTimersByTimeAsync(1100);

    await expect(outcome).resolves.toEqual({
      ok: false,
      result: "Target deals-layout-board did not activate.",
    });
    expect(target.click).toHaveBeenCalledOnce();
  });
});

describe("AgentUiControlStore.openRecord", () => {
  it("builds page and drawer paths and propagates a blocked navigation", async () => {
    const navigate = vi.fn().mockResolvedValue("navigated");
    const store = controlStore();
    store.registerNavigate(navigate);

    await store.openRecord({
      entity: "deal",
      recordId: "00000000-0000-4000-8000-000000000001",
      presentation: "page",
    });
    expect(navigate).toHaveBeenLastCalledWith("/deals/00000000-0000-4000-8000-000000000001");

    await store.openRecord({ entity: "contact", recordId: "new" });
    expect(navigate).toHaveBeenLastCalledWith("/contacts?open=contact:new");

    navigate.mockResolvedValue("blocked");
    const blocked = await store.openRecord({
      entity: "task",
      recordId: "00000000-0000-4000-8000-000000000002",
    });
    expect(blocked).toMatchObject({
      ok: false,
      result: "Navigation requires the user to resolve unsaved changes.",
    });
  });
});
