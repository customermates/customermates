// @vitest-environment jsdom

import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { action, observable } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ addChannelStore: null as unknown }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ addChannelStore: harness.addChannelStore }),
}));
vi.mock("@/ee/messaging/provider-icon", () => ({
  getProviderIcon: () => (props: Record<string, unknown>) => createElement("span", props),
}));

import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AddChannelPopover } from "@/app/[locale]/(protected)/contacts/components/add-channel-popover";

let container: HTMLDivElement;
let reactRoot: Root;

function render(node: ReactNode) {
  act(() => reactRoot.render(node));
}

function input() {
  const found = document.querySelector<HTMLInputElement>("[cmdk-input]");
  if (!found) throw new Error("Expected the command input");
  return found;
}

function selectedOptionId() {
  return document.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]')?.id ?? null;
}

function press(key: string) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  document.body.replaceChildren();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
});

describe("CommandInput active option", () => {
  function results(values: string[]) {
    return createElement(
      Command,
      { shouldFilter: false },
      createElement(CommandInput, { placeholder: "Search" }),
      createElement(
        CommandList,
        null,
        values.map((value) => createElement(CommandItem, { key: value, value }, value)),
      ),
    );
  }

  it("points aria-activedescendant at the option the list auto-selects", () => {
    render(results(["sophie-hoffmann", "sophie-schmidt"]));

    expect(selectedOptionId()).not.toBeNull();
    expect(input().getAttribute("aria-activedescendant")).toBe(selectedOptionId());
  });

  it("follows the highlighted option through arrow keys and a changed result list", () => {
    render(results(["sophie-hoffmann", "sophie-schmidt"]));
    press("ArrowDown");

    expect(input().getAttribute("aria-activedescendant")).toBe(selectedOptionId());

    render(results(["hoffmann-gmbh", "hoffmann-ag"]));

    expect(document.querySelector('[aria-selected="true"]')?.textContent).toBe("hoffmann-gmbh");
    expect(input().getAttribute("aria-activedescendant")).toBe(selectedOptionId());
  });

  it("drops aria-activedescendant when the list is empty", () => {
    render(results(["sophie-hoffmann"]));
    render(results([]));

    expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  });
});

describe("AddChannelPopover combobox state", () => {
  function channelStore() {
    const store = observable(
      {
        addAsNewOptions: [] as string[],
        isResolving: false,
        isSearching: false,
        mergedCandidates: [] as { candidate: Record<string, string>; source: string }[],
        open: false,
        query: "",
        searchError: false,
        addAsNew: vi.fn(),
        reset: vi.fn(),
        retrySearch: vi.fn(),
        selectCandidate: vi.fn(),
        setContactId: vi.fn(),
        setOpen(next: boolean) {
          store.open = next;
        },
        setQuery(next: string) {
          store.query = next;
        },
      },
      { setOpen: action, setQuery: action },
    );
    return store;
  }

  function expectClosed() {
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().hasAttribute("aria-controls")).toBe(false);
    expect(input().hasAttribute("aria-activedescendant")).toBe(false);
  }

  it("reports a closed suggestion list truthfully and an open one with its listbox", async () => {
    const store = channelStore();
    harness.addChannelStore = store;
    render(createElement(AddChannelPopover, { contactId: "contact-1" }));

    expectClosed();

    await act(async () => {
      store.setOpen(true);
      store.setQuery("sophie@example.com");
      store.mergedCandidates = [
        {
          candidate: { displayName: "Sophie", provider: "gmail", value: "sophie@example.com" },
          source: "contact",
        },
      ];
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const controls = input().getAttribute("aria-controls");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(controls && document.getElementById(controls)?.getAttribute("role")).toBe("listbox");
    expect(input().getAttribute("aria-activedescendant")).toBe(selectedOptionId());

    press("Escape");

    expectClosed();
  });
});
