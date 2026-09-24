import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => ({ agentChatStore: {} }) }));
vi.mock("@/core/utils/use-copy-to-clipboard", () => ({ useCopyToClipboard: () => vi.fn() }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: (entity: string) => entity }),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../chat-ui", () => ({
  ActionTooltip: ({ children }: { children: ReactNode }) => children,
  ItemTime: () => null,
  TypingDots: () => null,
  chatUiCopy: () => ({ turnFailed: "Failed", retryTurn: "Retry" }),
  focusAgentComposer: vi.fn(),
}));

import { AgentChatItemView } from "../agent-chat-items";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AgentChatItemView message links", () => {
  const renderMessage = async (renderLinksAsText: boolean) => {
    await act(async () => {
      root.render(
        createElement(AgentChatItemView, {
          item: {
            kind: "assistant",
            id: "assistant-1",
            text: "[Company Overview](/wiki?page=fbdddad0-7f4f-4159-bc04-20c5ae6d666b)",
            streaming: false,
          },
          readOnly: true,
          renderLinksAsText,
        }),
      );
      await Promise.resolve();
    });
  };

  it("renders links as non-interactive text when the host requests it", async () => {
    await renderMessage(true);

    expect(container.textContent).toContain("Company Overview");
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[href]")).toBeNull();
    expect(container.querySelector('[data-streamdown="link"]')).toBeNull();
    expect(container.querySelector("span.underline")).not.toBeNull();
  });

  it("keeps the standard link renderer for ordinary chat surfaces", async () => {
    await renderMessage(false);

    expect(container.querySelector('[data-streamdown="link"]')).not.toBeNull();
  });
});
