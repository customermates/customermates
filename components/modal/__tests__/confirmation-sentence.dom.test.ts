import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ href, ...props }: { href: string }) => createElement("a", { ...props, href }),
}));

import { ConfirmationSentenceView, referenceSentence } from "../confirmation-sentence";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render(sentence: Parameters<typeof ConfirmationSentenceView>[0]["sentence"]) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(ConfirmationSentenceView, { sentence })));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("confirmation sentence view", () => {
  it("maps calculation segments onto chips with their references", () => {
    expect(
      referenceSentence([
        "Total adds up ",
        { kind: "field", id: "f1", label: "Value", typeId: "t2" },
        " of all linked ",
        { kind: "list", id: "t2", label: "Deals", icon: "handshake" },
      ]),
    ).toEqual([
      "Total adds up ",
      { label: "Value", icon: "field", reference: "field:f1", action: undefined },
      " of all linked ",
      { label: "Deals", icon: { list: "handshake" }, reference: "list:t2", action: undefined },
    ]);
  });

  it("opens a chip through its action, links a chip with an href and leaves other chips plain", () => {
    const onOpen = vi.fn();
    const view = render([
      { label: "Acme", icon: { list: "building" }, action: { label: "Open Acme", onOpen } },
      " and ",
      { label: "Amount", icon: "field", href: "/configure?focus=field" },
      " from ",
      { label: "Value", icon: "field", reference: "field:f1" },
    ]);

    const button = view.querySelector<HTMLButtonElement>('button[aria-label="Open Acme"]');
    expect(button?.textContent).toBe("Acme");
    act(() => button?.click());
    expect(onOpen).toHaveBeenCalledWith(button);

    expect(view.querySelector("a")?.getAttribute("href")).toBe("/configure?focus=field");
    expect(view.querySelectorAll("[data-confirmation-chip]")).toHaveLength(2);
    expect(view.querySelector('[data-sentence-reference="field:f1"]')?.closest("a, button")).toBeNull();
    expect(view.textContent).toBe("Acme and Amount from Value");
  });
});
