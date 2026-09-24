import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
}));

import { MessageResponse, type MessageResponseProps } from "../message";

let container: HTMLDivElement;
let root: Root;
const pageUrl = "/wiki?page=fbdddad0-7f4f-4159-bc04-20c5ae6d666b";

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(window, "open").mockReturnValue(null);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function clickLink(url: string, props: MessageResponseProps = {}) {
  await act(async () => {
    root.render(createElement(MessageResponse, props, `[Source](${url})`));
    await Promise.resolve();
  });
  const link = container.querySelector<HTMLElement>('[data-streamdown="link"]');
  if (!link) throw new Error("Message source link did not render.");
  await act(async () => {
    link.click();
    await Promise.resolve();
  });
}

describe("MessageResponse source links", () => {
  it.each(["static", "streaming"] as const)("opens a %s Wiki citation without confirmation", async (mode) => {
    await clickLink(pageUrl, { mode });

    expect(window.open).toHaveBeenCalledExactlyOnceWith(pageUrl, "_blank", "noreferrer");
    expect(container.querySelector('[data-streamdown="link-safety-modal"]')).toBeNull();
  });

  it.each(["https://example.com/source", "/api/v1/mcp", "/wiki?page=not-a-uuid"])(
    "retains the confirmation before opening %s",
    async (url) => {
      await clickLink(url);

      expect(window.open).not.toHaveBeenCalled();
      expect(container.textContent).toContain(url);
      expect(container.querySelector('[data-streamdown="link-safety-modal"]')).not.toBeNull();
    },
  );

  it("honors an explicit caller link-check override", async () => {
    const onLinkCheck = vi.fn(() => false);
    await clickLink(pageUrl, { linkSafety: { enabled: true, onLinkCheck } });

    expect(onLinkCheck).toHaveBeenCalledExactlyOnceWith(pageUrl);
    expect(window.open).not.toHaveBeenCalled();
  });
});
