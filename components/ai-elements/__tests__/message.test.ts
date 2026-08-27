import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/core/utils/clipboard", () => ({ copyToClipboard: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", { "data-slot": "tooltip" }, children),
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-content" }, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-trigger" }, children),
}));

import { MessageResponse } from "../message";

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
