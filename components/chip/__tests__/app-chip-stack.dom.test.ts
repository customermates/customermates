import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/use-navigate-to-href", () => ({ useNavigateToHref: () => vi.fn() }));
import { AppChipStack } from "../app-chip-stack";
import { TooltipProvider } from "@/components/ui/tooltip";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(240);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(200);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const items = [
  { id: "one", label: "First linked record" },
  { id: "two", label: "Second linked record" },
];
function render(onMoreClick: () => void, onMoreClickWhenLoaded = false) {
  act(() =>
    root.render(
      createElement(TooltipProvider, null, createElement(AppChipStack, { items, onMoreClick, onMoreClickWhenLoaded })),
    ),
  );
}
describe("chip overflow callback compatibility", () => {
  it("keeps the existing hidden-item menu when every record was already fetched", async () => {
    const more = vi.fn();
    render(more);
    const trigger = host.querySelector<HTMLButtonElement>('[data-slot="dropdown-menu-trigger"]');
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(more).not.toHaveBeenCalled();
    expect(document.querySelector('[role="menuitem"]')?.textContent).toBe("Second linked record");
  });
  it("uses the custom overflow action only when a consumer opts in", () => {
    const more = vi.fn();
    render(more, true);
    expect(host.querySelector('[data-slot="dropdown-menu-trigger"]')).toBeNull();
    const trigger = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "+1",
    );
    act(() => trigger?.click());
    expect(more).toHaveBeenCalledOnce();
  });
});
