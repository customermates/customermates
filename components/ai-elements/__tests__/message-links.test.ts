import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => true }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ agentChatStore: { enabled: true, isOpen: true }, agentUiControlStore: { active: null } }),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement("a", { ...props, "data-intl-link": "true", href: `/en${href}` }, children),
  usePathname: () => "/dashboard",
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
}));

import { MessageResponse } from "../message";

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
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function clickLink(url: string, mode: "static" | "streaming" = "static") {
  await act(async () => {
    root.render(createElement(MessageResponse, { mode }, `[Source](${url})`));
    await Promise.resolve();
  });
  const link = container.querySelector<HTMLAnchorElement>("a");
  if (!link) throw new Error("Message source link did not render.");
  document.addEventListener("click", (event) => event.preventDefault(), { once: true });
  await act(async () => {
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  return link;
}

describe("MessageResponse source links", () => {
  it.each(["static", "streaming"] as const)(
    "opens a %s Wiki citation in the app without confirmation",
    async (mode) => {
      const link = await clickLink(pageUrl, mode);

      expect(link.getAttribute("href")).toBe(`/en${pageUrl}`);
      expect(link.dataset.intlLink).toBe("true");
      expect(link.getAttribute("target")).toBeNull();
      expect(window.open).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain("AgentChat.ui.externalLinkTitle");
    },
  );

  it("retains the confirmation before opening an external source", async () => {
    const url = "https://example.com/source";
    await clickLink(url);

    expect(window.open).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("AgentChat.ui.externalLinkTitle");
    expect(document.querySelector('[data-slot="message-link-url"]')?.textContent).toBe(url);
  });
});
