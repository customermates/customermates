import type { Root } from "react-dom/client";
import type { CreatePaletteAi, CreatePaletteTemplate } from "../create-palette";

import { FileText, Mail } from "lucide-react";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

import { CreatePalette } from "../create-palette";

const TEMPLATES: CreatePaletteTemplate[] = [
  {
    id: "offer",
    title: "Follow up after an offer",
    description: "Stage changes, then a task",
    icon: FileText,
    badge: { label: "Exact", tone: "outline" },
  },
  {
    id: "enquiries",
    title: "Answer new enquiries",
    description: "An agent drafts a reply",
    icon: Mail,
    badge: { label: "Agent", tone: "ink" },
  },
];

type Options = { ai?: CreatePaletteAi | null; templates?: CreatePaletteTemplate[]; blank?: boolean };

let container: HTMLDivElement;
let root: Root;
const onTemplate = vi.fn();
const onBlank = vi.fn();
const onClose = vi.fn();

function Harness({ ai = null, templates = TEMPLATES, blank = true }: Options) {
  const [query, setQuery] = useState("");
  return createElement(CreatePalette<CreatePaletteTemplate>, {
    open: true,
    title: "New automation",
    placeholder: "Describe it",
    query,
    templates,
    ai,
    blank: blank ? { label: "Start blank", onSelect: onBlank } : null,
    onQueryChange: setQuery,
    onTemplate,
    onClose,
  });
}

function render(options: Options = {}) {
  act(() => root.render(createElement(Harness, options)));
}

function input() {
  const found = document.querySelector<HTMLInputElement>("[cmdk-input]");
  if (!found) throw new Error("Expected the palette input");
  return found;
}

// eslint-disable-next-line @typescript-eslint/unbound-method -- the prototype setter must bypass React's value tracker so cmdk sees the change
const setNativeInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set as
  | ((this: HTMLInputElement, value: string) => void)
  | undefined;

function type(value: string) {
  act(() => {
    setNativeInputValue?.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(key: string) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

const rows = () =>
  [...document.querySelectorAll<HTMLElement>("[cmdk-item]")].map(
    (item) =>
      item.getAttribute("data-create-palette-template") ??
      (item.hasAttribute("data-create-palette-ai")
        ? "ai"
        : item.hasAttribute("data-create-palette-blank")
          ? "blank"
          : "?"),
  );

const selected = () => {
  const item = document.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]');
  if (!item) return null;
  return (
    item.getAttribute("data-create-palette-template") ?? (item.hasAttribute("data-create-palette-ai") ? "ai" : "blank")
  );
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.replaceChildren();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
});

describe("CreatePalette rows", () => {
  it("lists the templates and the blank row, with the first row selected", () => {
    render();

    expect(rows()).toEqual(["offer", "enquiries", "blank"]);
    expect(selected()).toBe("offer");
    expect(document.body.textContent).toContain("Exact");
    expect(document.body.textContent).toContain("Agent");
  });

  it("shows the AI row first, with the typed text, only once something is typed", () => {
    render({ ai: { label: "Create with AI", onSelect: vi.fn() } });
    expect(rows()).toEqual(["offer", "enquiries", "blank"]);

    type("answer new enquiries");

    expect(rows()).toEqual(["ai", "enquiries", "blank"]);
    expect(selected()).toBe("ai");
    expect(document.body.textContent).toContain('CreatePalette.quoted:{"text":"answer new enquiries"}');
  });

  it("has no AI row without AI, and says so when no template matches", () => {
    render();

    type("invoice reminder");

    expect(rows()).toEqual(["blank"]);
    expect(document.body.textContent).toContain("CreatePalette.noTemplates");
  });

  it("shows the AI notice and keeps the rows from being chosen while the AI works", () => {
    const onSelect = vi.fn();
    render({ ai: { label: "Create with AI", onSelect, pending: true, notice: "Mate is busy" } });
    type("tell me about deals");

    expect(document.querySelector("[data-create-palette-notice]")?.textContent).toBe("Mate is busy");
    expect(document.querySelector("[data-create-palette-ai]")?.getAttribute("aria-disabled")).toBe("true");
    press("Enter");
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("CreatePalette keyboard", () => {
  it("moves with the arrow keys and opens the selected row with Enter", () => {
    render();

    press("ArrowDown");
    expect(selected()).toBe("enquiries");
    press("Enter");

    expect(onTemplate).toHaveBeenCalledWith(TEMPLATES[1], "");
  });

  it("hands the typed text to the AI row and to the blank row", () => {
    const onSelect = vi.fn();
    render({ ai: { label: "Create with AI", onSelect } });
    type("  when a deal is won  ");

    press("Enter");
    expect(onSelect).toHaveBeenCalledWith("when a deal is won");

    press("ArrowDown");
    press("Enter");
    expect(onBlank).toHaveBeenCalledWith("when a deal is won");
  });

  it("browses all templates with Tab while a filter hides some, and Tab again goes back to the matches", () => {
    render();
    type("enquiries");
    expect(rows()).toEqual(["enquiries", "blank"]);
    expect(document.body.textContent).toContain('CreatePalette.hintBrowseAll:{"count":2}');

    press("Tab");
    expect(rows()).toEqual(["offer", "enquiries", "blank"]);

    press("Tab");
    expect(rows()).toEqual(["enquiries", "blank"]);
  });

  it("closes on Escape", () => {
    render();

    press("Escape");

    expect(onClose).toHaveBeenCalled();
  });
});
