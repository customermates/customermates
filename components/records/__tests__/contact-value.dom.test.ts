import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const copy = vi.hoisted(() => vi.fn());
vi.mock("@/core/utils/use-copy-to-clipboard", () => ({ useCopyToClipboard: () => copy }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
}));

import { CopyableText } from "@/components/shared/copyable-text";
import { ContactValue } from "../contact-value";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  copy.mockReset().mockResolvedValue(true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("shared copyable contact values", () => {
  it("keeps the inbox copy action and copies the raw value instead of its display label", () => {
    const clickRow = vi.fn();
    const keyRow = vi.fn();
    act(() => {
      root.render(
        createElement(
          "div",
          { onClick: clickRow, onKeyDown: keyRow },
          createElement(CopyableText, { value: "reader@example.test", label: "Reader", ariaLabel: "Copy Reader" }),
        ),
      );
    });
    const button = host.querySelector<HTMLButtonElement>("button");
    act(() => {
      button?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      button?.click();
    });
    expect(button?.getAttribute("aria-label")).toBe("Copy Reader");
    expect(copy).toHaveBeenCalledExactlyOnceWith("reader@example.test");
    expect(clickRow).not.toHaveBeenCalled();
    expect(keyRow).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "email" as const, value: "reader@example.test", href: "mailto:reader@example.test" },
    { kind: "phone" as const, value: "+49 30 123456", href: "tel:+4930123456" },
    { kind: "url" as const, value: "https://example.test/guide", href: "https://example.test/guide" },
  ])("keeps $kind links independent from their copy action", ({ kind, value, href }) => {
    const clickRow = vi.fn();
    act(() => {
      root.render(createElement("div", { onClick: clickRow }, createElement(ContactValue, { kind, value })));
    });
    const link = host.querySelector<HTMLAnchorElement>("a");
    expect(link?.getAttribute("href")).toBe(href);
    expect(link?.getAttribute("target")).toBe(kind === "url" ? "_blank" : null);
    expect(link?.getAttribute("rel")).toBe(kind === "url" ? "noopener noreferrer" : null);
    link?.addEventListener("click", (event) => event.preventDefault());
    act(() => link?.click());
    expect(copy).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLButtonElement>("button")?.click());
    expect(copy).toHaveBeenCalledExactlyOnceWith(value);
    expect(clickRow).not.toHaveBeenCalled();
    expect(host.querySelector("button a, a button")).toBeNull();
  });

  it("uses one whole-label copy action for a copy-configured field", () => {
    const value = "billing@example.test";
    act(() => root.render(createElement(ContactValue, { action: "copy", kind: "email", value })));
    expect(host.querySelector("a")).toBeNull();
    expect(host.querySelectorAll("button")).toHaveLength(1);
    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button?.getAttribute("aria-label")).toBe(value);
    act(() => button?.click());
    expect(copy).toHaveBeenCalledExactlyOnceWith(value);
  });

  it("keeps an invalid link noninteractive while retaining the copy action", () => {
    const value = "javascript:alert(1)";
    act(() => root.render(createElement(ContactValue, { kind: "url", value })));
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).toContain(value);
    act(() => host.querySelector<HTMLButtonElement>("button")?.click());
    expect(copy).toHaveBeenCalledExactlyOnceWith(value);
  });
});
