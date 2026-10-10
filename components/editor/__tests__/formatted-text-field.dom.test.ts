import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { FormattedTextField } from "../formatted-text-field";

const roots = new Set<Root>();

const DOCUMENT = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Read the " },
        { type: "text", text: "brief", marks: [{ type: "link", attrs: { href: "https://example.com/brief" } }] },
        { type: "text", text: " before the call." },
      ],
    },
  ],
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const rects = () => [] as unknown as DOMRectList;
  const rect = () => new DOMRect();
  Object.assign(Range.prototype, { getClientRects: rects, getBoundingClientRect: rect });
  Object.assign(Text.prototype, { getClientRects: rects, getBoundingClientRect: rect });
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.innerHTML = "";
});

async function renderField(host: HTMLElement, onChange = vi.fn()) {
  const root = createRoot(host);
  roots.add(root);
  await act(async () => {
    root.render(createElement(FormattedTextField, { data: DOCUMENT, label: "Notes", onChange }));
    await Promise.resolve();
  });
  const field = host.querySelector<HTMLElement>("[data-formatted-text-field]");
  if (!field) throw new Error("Missing formatted text field");
  return field;
}

function area(field: HTMLElement) {
  const element = field.querySelector<HTMLElement>("[data-formatted-text-area]");
  if (!element) throw new Error("Missing formatted text area");
  return element;
}

function editorElement(field: HTMLElement) {
  const element = field.querySelector<HTMLElement>(".ProseMirror");
  if (!element) throw new Error("Missing editor");
  return element;
}

async function dispatch(target: Element, event: Event) {
  await act(async () => {
    target.dispatchEvent(event);
    await Promise.resolve();
  });
}

describe("FormattedTextField", () => {
  it("starts editing on a plain click but leaves links and text selections alone", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const field = await renderField(host);
    const editor = editorElement(field);
    expect(editor.getAttribute("role")).toBe("textbox");
    expect(editor.getAttribute("aria-readonly")).toBe("true");
    expect(field.querySelector("button[aria-label='RecordModel.editValue']")).not.toBeNull();

    const link = field.querySelector("a[href='https://example.com/brief']");
    if (!link) throw new Error("Missing link");
    const followed = vi.fn((event: Event) => event.preventDefault());
    document.addEventListener("click", followed);
    await dispatch(link, new MouseEvent("click", { bubbles: true, cancelable: true }));
    document.removeEventListener("click", followed);
    expect(followed).toHaveBeenCalledTimes(1);
    expect(field.dataset.state).toBe("display");

    const text = editor.querySelector("p")?.firstChild;
    if (!text) throw new Error("Missing text");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    await dispatch(editor.querySelector("p") ?? editor, new MouseEvent("click", { bubbles: true }));
    expect(field.dataset.state).toBe("display");

    window.getSelection()?.removeAllRanges();
    await dispatch(area(field), new MouseEvent("click", { bubbles: true }));
    expect(field.dataset.state).toBe("editing");
    expect(editorElement(field).getAttribute("aria-readonly")).toBe("false");
  });

  it("finishes editing inside a host popover on Escape and outside clicks without closing the host", async () => {
    const popover = document.createElement("div");
    popover.dataset.slot = "popover-content";
    const sibling = document.createElement("button");
    const host = document.createElement("div");
    popover.append(host, sibling);
    document.body.append(popover);
    const onChange = vi.fn();
    const field = await renderField(host, onChange);
    const hostEscape = vi.fn();
    document.addEventListener("keydown", hostEscape, true);

    await dispatch(area(field), new MouseEvent("click", { bubbles: true }));
    expect(field.dataset.state).toBe("editing");
    await dispatch(sibling, new MouseEvent("pointerdown", { bubbles: true }));
    expect(field.dataset.state).toBe("display");

    await dispatch(area(field), new MouseEvent("click", { bubbles: true }));
    const menu = document.createElement("div");
    menu.dataset.editorMenu = "";
    document.body.append(menu);
    await dispatch(editorElement(field), new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(field.dataset.state).toBe("editing");
    menu.remove();
    hostEscape.mockClear();

    await dispatch(editorElement(field), new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.removeEventListener("keydown", hostEscape, true);
    expect(field.dataset.state).toBe("display");
    expect(hostEscape).not.toHaveBeenCalled();
    expect(popover.isConnected).toBe(true);
    expect(editorElement(field).textContent).toContain("Read the brief before the call.");
  });
});
