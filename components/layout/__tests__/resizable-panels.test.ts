import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    key === "ResizablePanels.resize" ? `Resize ${values?.before} and ${values?.after}` : key,
}));

import { ResizablePanelGroup } from "../resizable-panels";

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function rect(width: number): DOMRect {
  return {
    bottom: 100,
    height: 100,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}

function dispatchPointer(
  target: HTMLElement,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  {
    clientX,
    pointerId = 7,
    pointerType = "mouse",
    timeStamp,
  }: {
    clientX: number;
    pointerId?: number;
    pointerType?: string;
    timeStamp?: number;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
  });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
    ...(timeStamp === undefined ? {} : { timeStamp: { value: timeStamp } }),
  });
  target.dispatchEvent(event);
}

function view(onSizesCommit = vi.fn()) {
  return createElement(ResizablePanelGroup, {
    className: "grid grid-cols-[var(--panel-grid-template)]",
    defaultTemplate: "300px 1px minmax(300px, 1fr)",
    panels: [
      {
        id: "left",
        label: "Overview",
        controlId: "left-panel",
        minimumSize: 200,
        maximumSize: 500,
        defaultSize: 300,
        element: createElement("section", { id: "left-panel" }, "Left"),
      },
      {
        id: "right",
        label: "Notes",
        controlId: "right-panel",
        minimumSize: 300,
        defaultSize: 700,
        element: createElement("section", { id: "right-panel" }, "Right"),
      },
    ],
    onSizesCommit,
  });
}

function threePanelView(onSizesCommit = vi.fn()) {
  return createElement(ResizablePanelGroup, {
    className: "grid grid-cols-[var(--panel-grid-template)]",
    defaultTemplate: "3fr 1px 4fr 1px 3fr",
    panels: [
      {
        id: "left",
        label: "Overview",
        controlId: "left-panel",
        minimumSize: 200,
        defaultSize: 300,
        element: createElement("section", { id: "left-panel" }, "Left"),
      },
      {
        id: "middle",
        label: "Notes",
        controlId: "middle-panel",
        minimumSize: 250,
        defaultSize: 400,
        element: createElement("section", { id: "middle-panel" }, "Middle"),
      },
      {
        id: "right",
        label: "Activities",
        controlId: "activities-panel",
        minimumSize: 200,
        defaultSize: 300,
        element: createElement("section", { id: "activities-panel" }, "Right"),
      },
    ],
    onSizesCommit,
  });
}

async function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  return container;
}

function prepareHandle(container: HTMLElement, index = 0) {
  const handle = container.querySelectorAll<HTMLDivElement>('[role="separator"]')[index];
  if (!handle) throw new Error("Expected a resize handle");
  let captured: number | undefined;
  const setPointerCapture = vi.fn((pointerId: number) => {
    captured = pointerId;
  });
  handle.setPointerCapture = setPointerCapture;
  handle.hasPointerCapture = vi.fn((pointerId) => captured === pointerId);
  const releasePointerCapture = vi.fn((pointerId: number) => {
    if (captured === pointerId) captured = undefined;
  });
  handle.releasePointerCapture = releasePointerCapture;
  return { handle, releasePointerCapture, setPointerCapture };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getPanelRect(this: HTMLElement) {
    if (this.id === "left-panel") return rect(300);
    if (this.id === "middle-panel") return rect(400);
    if (this.id === "activities-panel") return rect(300);
    if (this.id === "right-panel") return rect(700);
    return rect(0);
  });
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
  vi.restoreAllMocks();
});

describe("ResizablePanelGroup", () => {
  it("exposes a labelled range separator for the neighboring panels", async () => {
    const container = await mount(view());
    const { handle } = prepareHandle(container);

    expect(handle.getAttribute("aria-controls")).toBe("left-panel right-panel");
    expect(handle.getAttribute("aria-label")).toBe("Resize Overview and Notes");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuemin")).toBe("200");
    expect(handle.getAttribute("aria-valuemax")).toBe("500");
    expect(handle.getAttribute("aria-valuenow")).toBe("300");
  });

  it("supports mouse dragging with pointer capture and commits only on release", async () => {
    const onSizesCommit = vi.fn();
    const container = await mount(view(onSizesCommit));
    const { handle, releasePointerCapture, setPointerCapture } = prepareHandle(container);

    act(() => dispatchPointer(handle, "pointerdown", { clientX: 300 }));
    expect(handle.dataset.state).toBe("resizing");
    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);

    act(() => dispatchPointer(handle, "pointermove", { clientX: 360 }));
    expect(onSizesCommit).not.toHaveBeenCalled();

    act(() => dispatchPointer(handle, "pointerup", { clientX: 360 }));
    expect(onSizesCommit).toHaveBeenCalledExactlyOnceWith([360, 640]);
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(handle.hasAttribute("data-state")).toBe(false);
  });

  it("cancels an in-flight drag on Escape without persisting it", async () => {
    const onSizesCommit = vi.fn();
    const container = await mount(view(onSizesCommit));
    const { handle } = prepareHandle(container);
    const group = container.querySelector<HTMLElement>("[data-resizable-panel-group]");

    act(() => {
      dispatchPointer(handle, "pointerdown", { clientX: 300 });
      dispatchPointer(handle, "pointermove", { clientX: 350 });
    });
    expect(group?.style.getPropertyValue("--panel-grid-template")).toContain("350fr");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onSizesCommit).not.toHaveBeenCalled();
    expect(group?.style.getPropertyValue("--panel-grid-template")).toBe("300px 1px minmax(300px, 1fr)");
  });

  it.each(["pointercancel", "blur", "resize"] as const)(
    "cancels an in-flight drag on %s without persisting it",
    async (interruption) => {
      const onSizesCommit = vi.fn();
      const container = await mount(view(onSizesCommit));
      const { handle } = prepareHandle(container);
      const group = container.querySelector<HTMLElement>("[data-resizable-panel-group]");

      act(() => {
        dispatchPointer(handle, "pointerdown", { clientX: 300 });
        dispatchPointer(handle, "pointermove", { clientX: 350 });
      });

      act(() => {
        if (interruption === "pointercancel") dispatchPointer(handle, "pointercancel", { clientX: 350 });
        else window.dispatchEvent(new Event(interruption));
      });

      expect(onSizesCommit).not.toHaveBeenCalled();
      expect(group?.style.getPropertyValue("--panel-grid-template")).toBe("300px 1px minmax(300px, 1fr)");
      expect(handle.hasAttribute("data-state")).toBe(false);
    },
  );

  it("resizes with arrow, Shift, Home, and End keys and resets with Enter", async () => {
    const onSizesCommit = vi.fn();
    const container = await mount(view(onSizesCommit));
    const { handle } = prepareHandle(container);

    act(() => {
      handle.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "ArrowRight",
          shiftKey: true,
        }),
      );
    });
    expect(onSizesCommit).toHaveBeenLastCalledWith([330, 670]);

    act(() => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Home" }));
    });
    expect(onSizesCommit).toHaveBeenLastCalledWith([200, 800]);

    act(() => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "End" }));
    });
    expect(onSizesCommit).toHaveBeenLastCalledWith([500, 500]);

    act(() => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    expect(onSizesCommit).toHaveBeenLastCalledWith(null);
  });

  it("supports touch dragging and touch double-tap reset", async () => {
    const onSizesCommit = vi.fn();
    const container = await mount(view(onSizesCommit));
    const { handle } = prepareHandle(container);

    act(() => {
      dispatchPointer(handle, "pointerdown", {
        clientX: 300,
        pointerType: "touch",
        timeStamp: 100,
      });
      dispatchPointer(handle, "pointermove", {
        clientX: 340,
        pointerType: "touch",
        timeStamp: 120,
      });
      dispatchPointer(handle, "pointerup", {
        clientX: 340,
        pointerType: "touch",
        timeStamp: 140,
      });
    });
    expect(onSizesCommit).toHaveBeenLastCalledWith([340, 660]);

    act(() => {
      dispatchPointer(handle, "pointerdown", {
        clientX: 300,
        pointerType: "touch",
        timeStamp: 300,
      });
      dispatchPointer(handle, "pointerup", {
        clientX: 300,
        pointerType: "touch",
        timeStamp: 320,
      });
      dispatchPointer(handle, "pointerdown", {
        clientX: 300,
        pointerType: "touch",
        timeStamp: 500,
      });
      dispatchPointer(handle, "pointerup", {
        clientX: 300,
        pointerType: "touch",
        timeStamp: 520,
      });
    });
    expect(onSizesCommit).toHaveBeenLastCalledWith(null);
  });

  it("resets with a mouse double-click", async () => {
    const onSizesCommit = vi.fn();
    const container = await mount(view(onSizesCommit));
    const { handle } = prepareHandle(container);

    act(() => {
      handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });

    expect(onSizesCommit).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("resizes only the panels adjacent to the selected divider", async () => {
    const onSizesCommit = vi.fn();
    const container = await mount(threePanelView(onSizesCommit));
    const { handle: second } = prepareHandle(container, 1);

    act(() => {
      dispatchPointer(second, "pointerdown", { clientX: 700 });
      dispatchPointer(second, "pointermove", { clientX: 750 });
      dispatchPointer(second, "pointerup", { clientX: 750 });
    });

    expect(onSizesCommit).toHaveBeenCalledExactlyOnceWith([300, 450, 250]);
  });
});
