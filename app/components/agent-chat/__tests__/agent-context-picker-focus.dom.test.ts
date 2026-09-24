import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentContextCandidate } from "../agent-context-registry";

type CloseAutoFocusEvent = { preventDefault: () => void };

const harness = vi.hoisted(() => ({
  contentProps: null as null | {
    onCloseAutoFocus: (event: CloseAutoFocusEvent) => void;
    onEscapeKeyDown: () => void;
  },
  focusAgentComposer: vi.fn(),
  store: {
    addComposerContext: vi.fn(),
    composerContexts: [],
    contextRegistry: { candidates: vi.fn((): AgentContextCandidate[] => []) },
  },
  globalSearchAction: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T>(component: T) => component,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/contacts",
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/app/[locale]/(protected)/search/actions", () => ({
  globalSearchAction: harness.globalSearchAction,
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: (value: string) => value }),
}));
vi.mock("@/components/entity-detail/entity-relations", () => ({
  ENTITY_ICON: {
    contact: () => null,
    organization: () => null,
    deal: () => null,
    service: () => null,
    task: () => null,
  },
}));
vi.mock("@/components/entity-detail/entity-search-result-label", () => ({
  entitySearchResultLabel: (item: { name: string }) => item.name,
}));
vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children?: ReactNode }) => children ?? null,
  CommandEmpty: ({ children }: { children?: ReactNode }) => children ?? null,
  CommandGroup: ({ children }: { children?: ReactNode }) => children ?? null,
  CommandInput: ({ value, onValueChange }: { value?: string; onValueChange?: (value: string) => void }) =>
    createElement("input", {
      "data-slot": "command-input",
      value,
      onChange: (event: { currentTarget: { value: string } }) => onValueChange?.(event.currentTarget.value),
    }),
  CommandItem: ({
    children,
    disabled,
    onSelect,
    value,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onSelect?: (value: string) => void;
    value: string;
  }) => createElement("button", { disabled, type: "button", value, onClick: () => onSelect?.(value) }, children),
  CommandList: ({ children }: { children?: ReactNode }) => children ?? null,
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => children ?? null,
  PopoverContent: (props: {
    children?: ReactNode;
    onCloseAutoFocus: (event: CloseAutoFocusEvent) => void;
    onEscapeKeyDown: () => void;
  }) => {
    harness.contentProps = props;
    return props.children ?? null;
  },
  PopoverTrigger: ({ children }: { children?: ReactNode }) => children ?? null,
}));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: vi.fn(),
}));
vi.mock("../chat-ui", () => ({
  ActionTooltip: ({ children }: { children?: ReactNode }) => children ?? null,
  focusAgentComposer: harness.focusAgentComposer,
}));
vi.mock("../agent-chat-store-context", () => ({
  useAgentChatStore: () => harness.store,
  useAgentChatUiTargets: () => ({
    composerId: "agent-composer",
    fallbackFocusId: "agent-panel-dialog",
    usageId: "agent-usage",
  }),
}));

import { AgentContextPicker } from "../agent-context-picker";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  harness.contentProps = null;
  harness.store.contextRegistry.candidates.mockReturnValue([]);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("AgentContextPicker focus return", () => {
  it.each([
    { openedBySlash: false, restoresComposer: false },
    { openedBySlash: true, restoresComposer: true },
  ])("restores the correct opener when openedBySlash=$openedBySlash", ({ openedBySlash, restoresComposer }) => {
    act(() =>
      root.render(
        createElement(AgentContextPicker, {
          open: true,
          restoreComposerFocusOnEscape: openedBySlash,
          onOpenChange: vi.fn(),
        }),
      ),
    );

    expect(harness.contentProps).not.toBeNull();
    act(() => harness.contentProps?.onEscapeKeyDown());

    const preventDefault = vi.fn();
    act(() => harness.contentProps?.onCloseAutoFocus({ preventDefault }));

    expect(preventDefault).toHaveBeenCalledTimes(restoresComposer ? 1 : 0);
    expect(harness.focusAgentComposer).toHaveBeenCalledTimes(restoresComposer ? 1 : 0);
  });

  it("searches from one character and adds a selected cross-entity record", async () => {
    vi.useFakeTimers();
    const onOpenChange = vi.fn();
    harness.globalSearchAction.mockResolvedValue({
      ok: true,
      data: {
        results: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            name: "Ada Lovelace",
            pictureUrl: null,
            type: "contact",
          },
          {
            id: "10000000-0000-4000-8000-000000000002",
            name: "Analytical Engines",
            pictureUrl: null,
            type: "organization",
          },
          {
            id: "10000000-0000-4000-8000-000000000003",
            name: "Review proposal",
            pictureUrl: null,
            type: "task",
          },
        ],
      },
    });

    act(() =>
      root.render(
        createElement(AgentContextPicker, {
          open: true,
          restoreComposerFocusOnEscape: false,
          onOpenChange,
        }),
      ),
    );

    const input = container.querySelector<HTMLInputElement>('[data-slot="command-input"]');
    expect(input).not.toBeNull();
    act(() => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "a");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(harness.globalSearchAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(harness.globalSearchAction).toHaveBeenCalledWith({ searchTerm: "a", limitPerEntity: 8 });
    expect(container.textContent).toContain("Ada Lovelace");
    expect(container.textContent).toContain("Analytical Engines");
    expect(container.textContent).toContain("Review proposal");

    const task = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Review proposal"),
    );
    expect(task).toBeDefined();
    act(() => task?.click());

    expect(harness.store.addComposerContext).toHaveBeenCalledWith(
      {
        reference: {
          kind: "record",
          entityType: "task",
          recordId: "10000000-0000-4000-8000-000000000003",
        },
        label: "Review proposal",
      },
      undefined,
      undefined,
      { replaceOldestAtLimit: false },
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps a current record discoverable when only a secondary field matches", async () => {
    vi.useFakeTimers();
    harness.store.contextRegistry.candidates.mockReturnValue([
      {
        context: {
          reference: {
            kind: "record",
            entityType: "contact",
            recordId: "10000000-0000-4000-8000-000000000001",
          },
          label: "Ada Lovelace",
        },
        pageRoute: "/en/contacts/contact-1",
      },
    ]);
    harness.globalSearchAction.mockResolvedValue({
      ok: true,
      data: {
        results: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            name: "Ada Lovelace",
            pictureUrl: null,
            type: "contact",
          },
        ],
      },
    });

    act(() =>
      root.render(
        createElement(AgentContextPicker, {
          open: true,
          restoreComposerFocusOnEscape: false,
          onOpenChange: vi.fn(),
        }),
      ),
    );

    const input = container.querySelector<HTMLInputElement>('[data-slot="command-input"]');
    act(() => {
      if (!input) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "ada@example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(harness.globalSearchAction).toHaveBeenCalledWith({
      searchTerm: "ada@example.com",
      limitPerEntity: 8,
    });
    expect(container.textContent).toContain("Ada Lovelace");
  });
});
