import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultEmailSettings } from "@/ee/messaging/email-settings";
import { EMAIL_STYLES } from "@/ee/messaging/email-styles";
import { renderEmailMarkdown } from "@/ee/messaging/outbound/render-signature";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { EmailMarkdownEditor } from "../email-markdown-editor";

const roots = new Set<Root>();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!("getClientRects" in Range.prototype)) {
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => document.createElement("div").getClientRects(),
    });
  }
  if (!("getBoundingClientRect" in Range.prototype)) {
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(),
    });
  }
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount();
    await new Promise((resolve) => setTimeout(resolve, 1));
  });
  roots.clear();
  document.body.innerHTML = "";
});

async function renderEditor(root: Root, value: string, onChange: (value: string) => void, disabled = false) {
  await act(async () => {
    root.render(
      createElement(EmailMarkdownEditor, {
        appearance: defaultEmailSettings().appearance,
        ariaLabel: "Email body",
        disabled,
        placeholder: "Write",
        value,
        onChange,
      }),
    );
    await Promise.resolve();
  });
}

describe("EmailMarkdownEditor", () => {
  it("matches generated email structure and uses shared typography and spacing", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.add(root);
    const markdown =
      "**Bold** and *italic* with ~~strike~~ and [link](https://example.com)\nNext line\n\n- One\n- Two\n\n1. First\n2. Second\n\n> Quoted text\n\n---\n\nLast paragraph";
    await renderEditor(root, markdown, vi.fn());
    const editor = container.querySelector(".ProseMirror");
    if (!editor) throw new Error("Missing email editor");
    const generated = new DOMParser().parseFromString(
      renderEmailMarkdown(markdown, defaultEmailSettings().appearance).html,
      "text/html",
    );
    const structure = (element: Element) =>
      Array.from(element.querySelectorAll("p, strong, em, s, a, ul, ol, li, blockquote, hr, br")).map((node) => ({
        tag: node.tagName,
        text: node.textContent?.replace(/\n/g, "").trim(),
        href: node.getAttribute("href"),
      }));
    expect(structure(editor)).toEqual(structure(generated.body));
    const style = container.querySelector<HTMLElement>(".email-markdown-editor")?.style;
    expect(style?.lineHeight).toBe(`${defaultEmailSettings().appearance.fontSize + EMAIL_STYLES.lineHeightOffset}px`);
    expect(style?.getPropertyValue("--email-block-gap")).toBe(`${EMAIL_STYLES.blockGap}px`);
    expect(editor.classList.contains("prose")).toBe(false);
  });

  it("does not report a content edit when saving disables and re-enables the editor", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.add(root);
    const onChange = vi.fn();
    const markdown = "**Name**  \nTeam";

    await renderEditor(root, markdown, onChange);
    expect(onChange).not.toHaveBeenCalled();

    await renderEditor(root, markdown, onChange, true);
    expect(container.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();

    await renderEditor(root, markdown, onChange, false);
    expect(container.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders the shared formatting toolbar without a heading control and keeps focus on mousedown", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.add(root);
    const onChange = vi.fn();
    await renderEditor(root, "Plain", onChange);

    const toolbar = container.querySelector<HTMLElement>("[data-formatting-toolbar]");
    expect(toolbar?.getAttribute("role")).toBe("toolbar");
    expect(toolbar?.getAttribute("aria-label")).toBe("Editor.formatting");
    expect(
      Array.from(toolbar?.querySelectorAll("button") ?? []).map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Editor.bold",
      "Editor.italic",
      "Editor.strikethrough",
      "Editor.bulletList",
      "Editor.numberedList",
      "Editor.blockQuote",
      "Editor.link",
      "Editor.divider",
    ]);

    const bold = toolbar?.querySelector("button[aria-label='Editor.bold']");
    if (!bold) throw new Error("Missing bold button");
    const mousedown = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    await act(async () => {
      bold.dispatchEvent(mousedown);
      await Promise.resolve();
    });
    expect(mousedown.defaultPrevented).toBe(true);
    expect(bold.getAttribute("aria-pressed")).toBe("true");
  });

  it("clears its document when the controlled Markdown value is cleared", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.add(root);
    const onChange = vi.fn();

    await renderEditor(root, "Message to send", onChange);
    expect(container.querySelector(".ProseMirror")?.textContent).toBe("Message to send");

    await renderEditor(root, "", onChange);

    expect(container.querySelector(".ProseMirror")?.textContent).toBe("");
    expect(onChange).not.toHaveBeenCalled();
  });
});
