// @vitest-environment jsdom

import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act,createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";

const harness = vi.hoisted(() => ({ addChannelStore: null as unknown }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ addChannelStore: harness.addChannelStore }),
}));
vi.mock("@/ee/messaging/provider-icon", () => ({
  getProviderIcon: () => (props: Record<string, unknown>) => createElement("span", props),
}));

import { Command,CommandInput,CommandItem,CommandList } from "@/components/ui/command";

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
