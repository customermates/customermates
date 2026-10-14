import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../editor-floating-menu", () => ({
  EditorFloatingMenu: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));

import { baseExtensions } from "../editor-extensions";
import { BubbleMenu } from "../bubble-menu";
import { SlashMenu } from "../slash-menu";
import { TableMenu } from "../table-menu";

const roots = new Set<Root>();
const editors = new Set<Editor>();
const scrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  for (const editor of editors) editor.destroy();
  roots.clear();
  editors.clear();
  vi.unstubAllGlobals();
  if (scrollIntoView) Object.defineProperty(Element.prototype, "scrollIntoView", scrollIntoView);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  document.body.innerHTML = "";
});

describe("rich-text commands during read-only recovery", () => {
  it.each([
    { kind: "format", menu: BubbleMenu, selector: '[aria-label="Editor.heading1"]', content: "<p>Notes</p>" },
    { kind: "insert", menu: SlashMenu, selector: '[cmdk-item][data-value="Editor.heading1"]', content: "<p>Notes</p>" },
    { kind: "table", menu: TableMenu, selector: "button", content: "<table><tr><td><p>Notes</p></td></tr></table>" },
  ])(
    "rejects keyboard and pointer $kind commands after editing has been disabled",
    async ({ menu, selector, content }) => {
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      roots.add(root);
      const editor = new Editor({ extensions: baseExtensions, content });
      editors.add(editor);
      let from = 0;
      let to = 0;
      editor.state.doc.descendants((node, position) => {
        if (node.isText && to === 0) {
          from = position;
          to = position + node.nodeSize;
        }
      });
      editor.commands.setTextSelection({ from, to });
      const before = editor.getJSON();
      const updated = vi.fn();
      editor.on("update", updated);
      await act(async () => {
        root.render(createElement(menu, { editor, anchorRect: { top: 0, left: 0 }, onClose: vi.fn() }));
        await Promise.resolve();
      });
      editor.setEditable(false, false);
      const command = container.querySelector<HTMLElement>(selector);
      if (!command) throw new Error("Missing rich-text command");
      await act(async () => {
        command.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        command.click();
        await Promise.resolve();
      });
      expect(editor.getJSON()).toEqual(before);
      expect(updated).not.toHaveBeenCalled();
    },
  );
});
