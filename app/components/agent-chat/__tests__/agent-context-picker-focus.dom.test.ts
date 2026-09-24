import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    contextRegistry: { candidates: vi.fn(() => []) },
  },
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
  globalSearchAction: vi.fn(),
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: (value: string) => value }),
}));
vi.mock("@/components/entity-detail/entity-relations", () => ({
  ENTITY_ICON: {},
}));
vi.mock("@/components/entity-detail/entity-search-result-label", () => ({
  entitySearchResultLabel: vi.fn(),
}));
vi.mock("@/components/ui/command", () => ({
  Command: ({ children }: { children?: ReactNode }) => children ?? null,
  CommandEmpty: ({ children }: { children?: ReactNode }) => children ?? null,
  CommandGroup: ({ children }: { children?: ReactNode }) => children ?? null,
  CommandInput: () => null,
  CommandItem: ({ children }: { children?: ReactNode }) => children ?? null,
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
vi.mock("@/core/utils/use-debounced-value", () => ({
  useDebouncedValue: <T>(value: T) => value,
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
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
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
});
