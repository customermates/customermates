// @vitest-environment jsdom

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const copyToClipboard = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: toastSuccess } }));
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => true }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ agentChatStore: { enabled: true, isOpen: true }, agentUiControlStore: { active: null } }),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, href, ...props }: { children: ReactNode; href: string }) =>
    createElement(
      "a",
      {
        ...props,
        "data-intl-link": "true",
        href: `/en${href}`,
        onClick: (event: ReactMouseEvent) => event.preventDefault(),
      },
      children,
    ),
  usePathname: () => "/dashboard",
}));

import { MessageResponse } from "@/components/ai-elements/message";

const PROMPT = '[data-slot="dialog-content"]';

let container: HTMLDivElement;
let reactRoot: Root;
let openWindow: ReturnType<typeof vi.spyOn>;

function render(markdown: string) {
  act(() => {
    reactRoot.render(createElement(MessageResponse, { mode: "static" }, markdown));
  });
}

function link(name: string) {
  const found = [...container.querySelectorAll("a")].find((anchor) => anchor.textContent === name);
  if (!found) throw new Error(`Missing link ${name}`);
  return found;
}

function button(name: string) {
  const found = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent === name);
  if (!found) throw new Error(`Missing button ${name}`);
  return found;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  copyToClipboard.mockReset().mockResolvedValue(true);
  toastSuccess.mockReset();
  openWindow = vi.spyOn(window, "open").mockReturnValue(null);
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  openWindow.mockRestore();
  document.body.style.pointerEvents = "";
});

describe("MessageResponse link prompt", () => {
  it("opens in-app routes and same-origin URLs in the app without a prompt", () => {
    render(
      `Open [Company settings](/company/settings) or [Roles](${window.location.origin}/de/company/settings#roles).`,
    );

    expect(link("Company settings").getAttribute("href")).toBe("/en/company/settings");
    expect(link("Roles").getAttribute("href")).toBe("/en/company/settings#roles");
    expect(link("Company settings").hasAttribute("target")).toBe(false);

    act(() => link("Company settings").click());

    expect(document.querySelector(PROMPT)).toBeNull();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("links same-origin addresses that are not app pages, such as the MCP endpoint, without a locale or a prompt", () => {
    const mcpUrl = `${window.location.origin}/api/v1/mcp`;
    render(`Server address: ${mcpUrl}\n\nAlso [llms.txt](/llms.txt).`);

    expect(link(mcpUrl).getAttribute("href")).toBe("/api/v1/mcp");
    expect(new URL(link(mcpUrl).getAttribute("href") ?? "", window.location.href).toString()).toBe(mcpUrl);
    expect(link(mcpUrl).getAttribute("target")).toBe("_blank");
    expect(link(mcpUrl).hasAttribute("data-intl-link")).toBe(false);
    expect(link("llms.txt").getAttribute("href")).toBe("/llms.txt");

    const keepJsdomFromNavigating = (event: Event) => event.preventDefault();
    document.addEventListener("click", keepJsdomFromNavigating, true);
    act(() => link(mcpUrl).click());
    document.removeEventListener("click", keepJsdomFromNavigating, true);

    expect(document.querySelector(PROMPT)).toBeNull();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("asks before leaving the app, in the app language, and copies the absolute URL", async () => {
    render("Read [the guide](https://example.com/guide?step=2#setup).");

    act(() => link("the guide").click());

    const prompt = document.querySelector(PROMPT);
    expect(prompt?.textContent).toContain("AgentChat.ui.externalLinkTitle");
    expect(prompt?.textContent).toContain("AgentChat.ui.externalLinkWarning");
    expect(prompt?.querySelector('[data-slot="message-link-url"]')?.textContent).toBe(
      "https://example.com/guide?step=2#setup",
    );
    expect(openWindow).not.toHaveBeenCalled();

    await act(async () => {
      button("AgentChat.ui.copyLink").click();
      await Promise.resolve();
    });

    expect(copyToClipboard).toHaveBeenCalledWith("https://example.com/guide?step=2#setup");
    expect(toastSuccess).toHaveBeenCalledWith("AgentChat.ui.linkCopied");

    act(() => button("AgentChat.ui.openLink").click());

    expect(openWindow).toHaveBeenCalledWith("https://example.com/guide?step=2#setup", "_blank", "noopener,noreferrer");
    expect(document.querySelector(PROMPT)).toBeNull();
  });

  it("lets Escape close only the prompt by marking the key as handled", () => {
    const panelSawEscape = vi.fn();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") panelSawEscape(event.defaultPrevented);
    };
    document.addEventListener("keydown", onKeyDown);
    render("Read [the guide](https://example.com/guide).");

    act(() => link("the guide").click());
    expect(document.querySelector(PROMPT)).not.toBeNull();

    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
      );
    });
    document.removeEventListener("keydown", onKeyDown);

    expect(document.querySelector(PROMPT)).toBeNull();
    expect(panelSawEscape).toHaveBeenCalledWith(true);
    expect(openWindow).not.toHaveBeenCalled();
  });
});
