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
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
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
