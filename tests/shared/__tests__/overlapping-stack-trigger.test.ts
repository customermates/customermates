// @vitest-environment jsdom

import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useNavigateToHref: () => vi.fn(),
}));

import { AvatarStack } from "@/components/shared/avatar-stack";
import { OverlappingStack } from "@/components/shared/overlapping-stack";

type Person = { id: string; firstName: string; lastName: string };

const people: Person[] = [
  { id: "user-1", firstName: "Ava", lastName: "Miller" },
  { id: "user-2", firstName: "Ben", lastName: "Koch" },
];

let container: HTMLDivElement;
let reactRoot: Root;

function stack(withRows: boolean) {
  return createElement(OverlappingStack<Person, Person>, {
    badgeKey: (person) => person.id,
    badges: people,
    renderBadge: (person) => createElement("span", { "data-badge": person.id }, person.firstName),
    renderOverflow: (count) => createElement("span", null, `+${count}`),
    ...(withRows
      ? {
          renderRow: (person: Person) =>
            createElement("div", { role: "menuitem", tabIndex: -1 }, `${person.firstName} ${person.lastName}`),
          rowKey: (person: Person) => person.id,
          rows: people,
          triggerLabel: "Ava Miller, Ben Koch",
        }
      : {}),
  });
}

function trigger() {
  const found = container.querySelector<HTMLButtonElement>("button");
  if (!found) throw new Error("Expected the stack trigger button");
  return found;
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
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  document.body.replaceChildren();
  document.body.style.pointerEvents = "";
  vi.unstubAllGlobals();
});

describe("OverlappingStack menu trigger", () => {
  it("is a named, keyboard-reachable button that carries the menu state", () => {
    const markup = renderToStaticMarkup(stack(true));

    expect(markup).toContain('<button aria-label="Ava Miller, Ben Koch"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('tabindex="-1"');
  });

  it("renders a plain stack with no menu semantics when it has no rows", () => {
    const markup = renderToStaticMarkup(stack(false));

    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("aria-haspopup");
    expect(markup).not.toContain("aria-expanded");
    expect(markup).not.toContain("tabindex");
  });

  it("opens from the keyboard and returns focus to the stack when the menu closes", async () => {
    act(() => reactRoot.render(stack(true)));
    const button = trigger();

    act(() => button.focus());
    expect(document.activeElement).toBe(button);

    await act(async () => {
      button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      await Promise.resolve();
    });
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      menu?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe("AvatarStack", () => {
  it("names its menu button after the people it lists", () => {
    const markup = renderToStaticMarkup(createElement(AvatarStack<Person>, { items: people, onAvatarClick: vi.fn() }));

    expect(markup).toContain('aria-label="Ava Miller, Ben Koch"');
    expect(markup).toContain('aria-haspopup="menu"');
  });

  it("offers no menu when its rows would open nothing", () => {
    const markup = renderToStaticMarkup(createElement(AvatarStack<Person>, { items: people }));

    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("aria-haspopup");
  });
});
