import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { Editor } from "../editor";

const roots = new Set<Root>();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.innerHTML = "";
});

async function renderEditor(root: Root, data: object | undefined, onChange: (data: object) => void, readOnly = false) {
  await act(async () => {
    root.render(createElement(Editor, { data, onChange, readOnly, label: "Notes" }));
    await Promise.resolve();
  });
}

describe("Editor", () => {
  it("clears previously populated controlled notes without reporting a content edit", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.add(root);
    const onChange = vi.fn();
    const notes = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Old notes" }] }] };
    await renderEditor(root, notes, onChange);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("Old notes");
    await renderEditor(root, undefined, onChange);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("");
    expect(onChange).not.toHaveBeenCalled();
  });
  it.each([
    { label: "missing notes", data: undefined, text: "" },
    {
      label: "existing notes",
      data: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Existing notes" }] }] },
      text: "Existing notes",
    },
  ])("preserves $label without reporting edits across save and retry modes", async ({ data, text }) => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.add(root);
    const onChange = vi.fn();

    await renderEditor(root, data, onChange);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe(text);
    expect(onChange).not.toHaveBeenCalled();

    for (const readOnly of [true, false, true, false]) {
      await renderEditor(root, data, onChange, readOnly);
      expect(container.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe(String(!readOnly));
      expect(container.querySelector(".ProseMirror")?.textContent).toBe(text);
      expect(onChange).not.toHaveBeenCalled();
    }

    const editor = container.querySelector(".ProseMirror");
    if (!editor) throw new Error("Missing Notes editor");
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { types: ["text/plain"], getData: (type: string) => (type === "text/plain" ? "New notes" : "") },
    });
    await act(async () => {
      editor.dispatchEvent(paste);
      await Promise.resolve();
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        type: "doc",
        content: expect.arrayContaining([expect.objectContaining({ type: "paragraph" })]),
      }),
    );
    expect(JSON.stringify(onChange.mock.calls[0][0])).toContain("New notes");
  });
});
