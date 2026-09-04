import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultEmailSettings } from "@/ee/messaging/email-settings";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { EmailMarkdownEditor } from "../email-markdown-editor";

const roots = new Set<Root>();

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.innerHTML = "";
});

async function renderEditor(root: Root, value: string, onChange: (value: string) => void) {
  await act(async () => {
    root.render(
      createElement(EmailMarkdownEditor, {
        appearance: defaultEmailSettings().appearance,
        ariaLabel: "Email body",
        placeholder: "Write",
        value,
        onChange,
      }),
    );
    await Promise.resolve();
  });
}

describe("EmailMarkdownEditor", () => {
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
