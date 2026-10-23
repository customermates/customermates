import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ current: { value: "", readOnly: false } }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../form-context", () => ({
  useAppForm: () => ({
    getValue: () => state.current.value,
    getError: () => undefined,
    onChange: (_id: string, value: string) =>
      runInAction(() => {
        state.current.value = value;
      }),
    isLoading: false,
    get isReadOnly() {
      return state.current.readOnly;
    },
  }),
}));

import { FormTextarea } from "../form-textarea";

let root: Root;
let host: HTMLDivElement;
const longText = "A long customer note that should wrap without cutting off names or losing the saved value. ".repeat(
  10,
);
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
const originalClient = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.current = observable({ value: longText, readOnly: false });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => (state.current.value.length > 100 ? 200 : 20),
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 80 });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalHeight);
  else delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
  if (originalClient) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClient);
  else delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
});
function render() {
  act(() => root.render(createElement(FormTextarea, { id: "notes", label: "Notes", collapsible: true })));
}
function button(text: string) {
  const result = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent === text,
  );
  if (!result) throw new Error(`Missing ${text}`);
  return result;
}

describe("expandable plain text fields", () => {
  it("expands and collapses without changing the stored value", () => {
    render();
    expect(host.querySelector("textarea")).toBeNull();
    expect(button("Common.actions.showMore").getAttribute("aria-expanded")).toBe("false");
    act(() => button("Common.actions.showMore").click());
    expect(host.querySelector("textarea")?.value).toBe(longText);
    expect(button("Common.actions.showLess").getAttribute("aria-expanded")).toBe("true");
    act(() => button("Common.actions.showLess").click());
    expect(host.querySelector("textarea")).toBeNull();
    expect(state.current.value).toBe(longText);
  });
  it("focuses the editor directly and finishes on Escape without closing the containing drawer", () => {
    render();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="RecordModel.editValue"]')?.click());
    const editor = host.querySelector("textarea");
    expect(document.activeElement).toBe(editor);
    const escaped = vi.fn();
    document.addEventListener("keydown", escaped);
    act(() => {
      editor?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    document.removeEventListener("keydown", escaped);
    expect(escaped).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(host.querySelector('[aria-label="RecordModel.editValue"]'));
    expect(state.current.value).toBe(longText);
  });
  it("allows read-only content to expand without enabling writes", () => {
    state.current.readOnly = true;
    render();
    expect(host.querySelector<HTMLButtonElement>('[aria-label="RecordModel.editValue"]')?.disabled).toBe(true);
    act(() => button("Common.actions.showMore").click());
    expect(host.querySelector("textarea")?.readOnly).toBe(true);
  });
  it("keeps short values as directly editable controls without a disclosure", () => {
    state.current.value = "Novak";
    render();
    expect(host.querySelector("textarea")?.value).toBe("Novak");
    expect(host.querySelector("button")).toBeNull();
  });
  it("keeps focus and the editor mounted when typing makes a short value overflow", () => {
    state.current.value = "Novak";
    render();
    const editor = host.querySelector("textarea");
    act(() => editor?.focus());
    act(() =>
      runInAction(() => {
        state.current.value = longText;
      }),
    );
    expect(host.querySelector("textarea")).toBe(editor);
    expect(document.activeElement).toBe(editor);
    expect(editor?.value).toBe(longText);
    act(() => editor?.blur());
    expect(host.querySelector("textarea")).toBeNull();
    expect(button("Common.actions.showMore")).toBeDefined();
  });
});
