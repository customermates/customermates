import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: () => "Contacts" }),
}));
vi.mock("../agent-chat-store-context", () => ({
  useAgentChatStore: () => ({}),
  useAgentChatUiTargets: () => ({
    composerId: "agent-composer",
    fallbackFocusId: "agent-panel-dialog",
    usageId: "agent-usage",
  }),
}));
vi.mock("../chat-ui", () => ({
  ActionTooltip: ({ children }: { children?: ReactNode }) => children,
  ItemTime: () => null,
  TypingDots: () => null,
  chatUiCopy: () => ({
    thinking: "thinking",
    stepsTook: (steps: number, seconds: number) => `${steps} / ${seconds}`,
  }),
  focusAgentComposer: () => undefined,
}));
vi.mock("@/components/shared/app-link", async () => {
  const { createElement } = await import("react");
  return {
    AppLink: ({ children, href }: { children?: ReactNode; href: string }) =>
      createElement("a", { href, onClick: (event: MouseEvent) => event.preventDefault() }, children),
  };
});

import { AgentActivity } from "../agent-chat-items";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AgentActivity controls", () => {
  it("keeps saved-view navigation independent from the keyboard-focusable disclosure", () => {
    act(() => {
      root.render(
        createElement(AgentActivity, {
          isTrailing: true,
          isWorking: false,
          items: [
            {
              kind: "activity",
              id: "activity-1",
              providerCallId: "call-1",
              activity: {
                kind: "views.configure",
                affectedResources: [],
                risk: "write",
                viewHref: "/contacts?view=__all__",
              },
              status: "done",
              at: new Date("2026-09-21T10:00:00.000Z"),
            },
          ],
        }),
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]');
    const link = container.querySelector<HTMLAnchorElement>('a[href="/contacts?view=__all__"]');
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(trigger?.className).toContain("focus-visible:ring-[3px]");
    expect(link).not.toBeNull();

    act(() => link?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");

    act(() => trigger?.focus());
    expect(document.activeElement).toBe(trigger);
    act(() => trigger?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[data-slot="collapsible-content"]')).not.toBeNull();

    act(() => link?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  });
});
