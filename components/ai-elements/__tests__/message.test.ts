import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string) => key,
}));
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
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", { "data-slot": "tooltip" }, children),
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-content" }, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-trigger" }, children),
}));

import { MessageResponse, messageLinkTarget } from "../message";

const markdownTable = `| Opportunity | Account | Value |
| --- | --- | ---: |
| Migration | Continental | €340,000 |`;

describe("MessageResponse tables", () => {
  it("uses one platform table surface with actions below it", () => {
    const markup = renderToStaticMarkup(createElement(MessageResponse, null, markdownTable));
    const frameIndex = markup.indexOf('data-slot="message-table-frame"');
    const actionsIndex = markup.indexOf('data-slot="message-table-actions"');

    expect(frameIndex).toBeGreaterThan(-1);
    expect(actionsIndex).toBeGreaterThan(frameIndex);
    expect(markup).toContain('aria-label="AgentChat.ui.copyTable"');
    expect(markup).toContain('aria-label="AgentChat.ui.downloadTable"');
    expect(markup).toContain("justify-start");
    expect(markup).not.toContain("justify-end");
    expect(markup).toContain("text-[11px] font-medium uppercase tracking-wide");
    expect(markup).not.toContain('data-streamdown="table-wrapper"');
    expect(markup).not.toContain("View fullscreen");
  });

  it("hides table actions while a response is streaming", () => {
    const markup = renderToStaticMarkup(
      createElement(MessageResponse, { mode: "streaming", showTableActions: false }, markdownTable),
    );

    expect(markup).toContain('data-slot="message-table-frame"');
    expect(markup).not.toContain('data-slot="message-table-actions"');
  });
});

describe("MessageResponse links", () => {
  it("opens an in-app route in the same tab through the locale-aware app link", () => {
    const markup = renderToStaticMarkup(
      createElement(MessageResponse, null, "Change it in [Company settings](/company/settings)."),
    );

    expect(markup).toContain('data-intl-link="true"');
    expect(markup).toContain('href="/en/company/settings"');
    expect(markup).not.toContain("target=");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("AgentChat.ui.externalLinkTitle");
  });

  it("links a record page by its relative route", () => {
    const markup = renderToStaticMarkup(
      createElement(MessageResponse, null, "Record: [CRM Rollout](/deals/80000000-0000-4000-8000-000000000003)"),
    );

    expect(markup).toContain('href="/en/deals/80000000-0000-4000-8000-000000000003"');
    expect(markup).toContain(">CRM Rollout</a>");
    expect(markup).not.toContain("](");
  });

  it("renders an external link as a real anchor whose confirmation starts closed", () => {
    const markup = renderToStaticMarkup(
      createElement(MessageResponse, null, "Read [the guide](https://example.com/guide)."),
    );

    expect(markup).toContain('href="https://example.com/guide"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).not.toContain("data-intl-link");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("AgentChat.ui.externalLinkTitle");
  });

  it("treats relative and same-origin links as app routes and resolves the rest to absolute URLs", () => {
    const page = "http://localhost:4012/de/dashboard?tab=1";

    expect(messageLinkTarget("/company/settings", page)).toEqual({ kind: "app", href: "/company/settings" });
    expect(messageLinkTarget("http://localhost:4012/en/company/settings?x=1#roles", page)).toEqual({
      kind: "app",
      href: "/company/settings?x=1#roles",
    });
    expect(messageLinkTarget("#roles", page)).toEqual({ kind: "app", href: "/dashboard?tab=1#roles" });
    expect(messageLinkTarget("/inbox?threadId=abc")).toEqual({ kind: "app", href: "/inbox?threadId=abc" });
    expect(messageLinkTarget("//evil.example/company/settings", page)).toEqual({
      kind: "external",
      url: "http://evil.example/company/settings",
    });
    expect(messageLinkTarget("https://customermates.com/company/settings", page)).toEqual({
      kind: "external",
      url: "https://customermates.com/company/settings",
    });
    expect(messageLinkTarget("mailto:team@example.com", page)).toEqual({
      kind: "external",
      url: "mailto:team@example.com",
    });
    expect(messageLinkTarget("http://[broken", page)).toBeNull();
  });

  it("keeps same-origin paths that are not localized pages unprefixed", () => {
    const page = "http://localhost:4012/de/dashboard";

    expect(messageLinkTarget("http://localhost:4012/api/v1/mcp", page)).toEqual({
      kind: "resource",
      href: "/api/v1/mcp",
    });
    expect(messageLinkTarget("/api/v1/openapi?format=json", page)).toEqual({
      kind: "resource",
      href: "/api/v1/openapi?format=json",
    });
    expect(messageLinkTarget("/llms.txt", page)).toEqual({ kind: "resource", href: "/llms.txt" });
    expect(messageLinkTarget("/v1/openapi.json", page)).toEqual({ kind: "resource", href: "/v1/openapi.json" });
    expect(messageLinkTarget("/.well-known/oauth-authorization-server", page)).toEqual({
      kind: "resource",
      href: "/.well-known/oauth-authorization-server",
    });
    expect(messageLinkTarget("/en/raw/docs/connect-cli.md", page)).toEqual({
      kind: "resource",
      href: "/en/raw/docs/connect-cli.md",
    });
    expect(messageLinkTarget("/profile/api-keys", page)).toEqual({ kind: "app", href: "/profile/api-keys" });
  });

  it("links the MCP address without a locale prefix", () => {
    vi.stubGlobal("window", { location: { href: "http://localhost:4012/en/dashboard" } });

    try {
      const markup = renderToStaticMarkup(
        createElement(MessageResponse, null, "Use http://localhost:4012/api/v1/mcp as the server address."),
      );

      expect(markup).toContain('href="/api/v1/mcp"');
      expect(markup).not.toContain('href="/en/api/v1/mcp"');
      expect(markup).not.toContain("data-intl-link");
      expect(markup).toContain('target="_blank"');
      expect(markup).toContain(">http://localhost:4012/api/v1/mcp</a>");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders a record link whose label was redacted as a working link", () => {
    for (const label of ["Deal [internal reference]", "[internal reference]", "[internal details] renewal"]) {
      const markup = renderToStaticMarkup(
        createElement(MessageResponse, null, `Record: [${label}](/deals/80000000-0000-4000-8000-000000000003)`),
      );

      expect(markup).toContain('href="/en/deals/80000000-0000-4000-8000-000000000003"');
      expect(markup).toContain(`>${label}</a>`);
      expect(markup).not.toContain("](");
    }
  });

  it("localizes the markdown controls Streamdown renders itself", () => {
    const markup = renderToStaticMarkup(createElement(MessageResponse, null, "```ts\nconst a = 1;\n```"));

    expect(markup).toContain('title="AgentChat.ui.downloadFile"');
    expect(markup).toContain('title="AgentChat.ui.copyCode"');
    expect(markup).not.toContain('title="Download file"');
    expect(markup).not.toContain('title="Copy Code"');
  });
});
