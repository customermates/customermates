import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mobile: false }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile }));

import { Sidebar, SidebarProvider, SidebarResizeHandle, SidebarTrigger } from "../sidebar";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

let root: Root | undefined;

function dispatchPointer(target: HTMLElement, type: string, clientX: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, cancelable: true, clientX });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 3 },
    pointerType: { value: "mouse" },
  });
  target.dispatchEvent(event);
}

function mount({ defaultOpen = true, defaultWidth }: { defaultOpen?: boolean; defaultWidth?: number } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      createElement(
        SidebarProvider,
        { defaultOpen, defaultWidth },
        createElement(Sidebar, { collapsible: "icon", variant: "inset" }, createElement(SidebarResizeHandle)),
        createElement(SidebarTrigger),
      ),
    );
  });
  const wrapper = document.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]');
  const container = document.querySelector<HTMLElement>('[data-slot="sidebar-container"]');
  const handle = document.querySelector<HTMLElement>('[role="separator"]');
  return { wrapper, container, handle };
}

function stubContainerWidth(container: HTMLElement | null, width: number) {
  if (container) container.getBoundingClientRect = () => ({ width }) as DOMRect;
}

beforeEach(() => {
  state.mobile = false;
  document.cookie = "sidebar_width=; path=/; max-age=0";
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

describe("SidebarResizeHandle", () => {
  it("starts from the stored width and exposes it as an adjustable separator", () => {
    const { wrapper, handle } = mount({ defaultWidth: 300 });

    expect(wrapper?.style.getPropertyValue("--sidebar-width")).toBe("300px");
    expect(handle?.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle?.getAttribute("aria-label")).toBe("Common.sidebar.resize");
    expect(handle?.getAttribute("aria-valuenow")).toBe("300");
    expect(handle?.getAttribute("aria-valuemin")).toBe("208");
    expect(handle?.getAttribute("aria-valuemax")).toBe("384");
  });

  it("previews the drag without a transition, clamps it and persists only the committed width", () => {
    const { wrapper, container, handle } = mount();
    stubContainerWidth(container, 256);
    if (!handle) throw new Error("missing handle");

    act(() => dispatchPointer(handle, "pointerdown", 256));
    act(() => dispatchPointer(handle, "pointermove", 300));

    expect(wrapper?.dataset.resizing).toBe("true");
    expect(wrapper?.style.getPropertyValue("--sidebar-width")).toBe("300px");
    expect(handle.getAttribute("aria-valuenow")).toBe("300");
    expect(document.cookie).not.toContain("sidebar_width");

    act(() => dispatchPointer(handle, "pointermove", 900));
    act(() => dispatchPointer(handle, "pointerup", 900));

    expect(wrapper?.dataset.resizing).toBeUndefined();
    expect(wrapper?.style.getPropertyValue("--sidebar-width")).toBe("384px");
    expect(document.cookie).toContain("sidebar_width=384");
    expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state")).toBe("expanded");
  });

  it("does not toggle or persist on a click without movement", () => {
    const { wrapper, container, handle } = mount();
    stubContainerWidth(container, 256);
    if (!handle) throw new Error("missing handle");

    act(() => dispatchPointer(handle, "pointerdown", 256));
    act(() => dispatchPointer(handle, "pointerup", 256));
    act(() => handle.click());

    expect(wrapper?.style.getPropertyValue("--sidebar-width")).toBe("16rem");
    expect(document.cookie).not.toContain("sidebar_width");
    expect(document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state")).toBe("expanded");
  });

  it("steps with the keyboard and resets on double-click", () => {
    const { wrapper, handle } = mount({ defaultWidth: 300 });
    if (!handle) throw new Error("missing handle");

    act(() => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }));
    });
    expect(wrapper?.style.getPropertyValue("--sidebar-width")).toBe("290px");
    expect(document.cookie).toContain("sidebar_width=290");

    act(() => {
      handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(wrapper?.style.getPropertyValue("--sidebar-width")).toBe("16rem");
    expect(document.cookie).not.toContain("sidebar_width");
  });

  it("is not offered when the sidebar is collapsed to icons or shown as the mobile sheet", () => {
    expect(mount({ defaultOpen: false }).handle).toBeNull();
    act(() => root?.unmount());
    document.body.innerHTML = "";

    state.mobile = true;
    expect(mount().handle).toBeNull();
  });
});
