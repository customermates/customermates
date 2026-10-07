// @vitest-environment jsdom

import type { Root } from "react-dom/client";
import type { EditorTab } from "../editor-tabs";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  errors: new Map<string, string[]>(),
  search: "",
  replace: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(harness.search) }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ replace: harness.replace }),
}));
vi.mock("@/components/forms/form-context", () => ({
  useAppForm: () => ({ getError: (id: string) => harness.errors.get(id) }),
}));

import { EditorTabs } from "../editor-tabs";

let container: HTMLDivElement;
let root: Root;

const tabs: EditorTab[] = [
  { id: "details", label: "Details", fields: ["values.name"], content: createElement("p", null, "Details body") },
  { id: "notes", label: "Notes", fields: ["values.notes"], content: createElement("p", null, "Notes body") },
];

function render(props: Partial<Parameters<typeof EditorTabs>[0]> = {}) {
  act(() => root.render(createElement(EditorTabs, { tabs, ...props })));
}

function tab(name: string) {
  const found = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((element) =>
    element.textContent?.startsWith(name),
  );
  if (!found) throw new Error(`Missing tab ${name}`);
  return found;
}

function choose(name: string) {
  act(() => {
    tab(name).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.errors.clear();
  harness.search = "";
  harness.replace.mockReset();
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("EditorTabs", () => {
  it("renders a single group plainly, without a tab bar", () => {
    render({ tabs: tabs.slice(0, 1) });
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(container.textContent).toContain("Details body");
  });

  it("marks a tab with an invalid field with an error dot", () => {
    harness.errors.set("values.notes", ["Required"]);
    render();
    expect(tab("Notes").dataset.invalid).toBe("true");
    expect(tab("Notes").querySelector("[data-tab-error-dot]")).not.toBeNull();
    expect(tab("Notes").textContent).toContain("EditorTabs.invalid");
    expect(tab("Details").dataset.invalid).toBeUndefined();
  });

  it("remembers the last tab per editor kind for drawers and modals", () => {
    render({ rememberAs: "record-drawer" });
    expect(tab("Details").dataset.state).toBe("active");
    choose("Notes");
    expect(tab("Notes").dataset.state).toBe("active");
    act(() => root.unmount());
    root = createRoot(container);
    render({ rememberAs: "record-drawer" });
    expect(tab("Notes").dataset.state).toBe("active");
    act(() => root.unmount());
    root = createRoot(container);
    render({ rememberAs: "field-drawer" });
    expect(tab("Details").dataset.state).toBe("active");
  });

  it("reads and writes the active tab in ?tab= on pages", () => {
    harness.search = "tab=notes&view=x";
    render({ syncUrl: true });
    expect(tab("Notes").dataset.state).toBe("active");
    choose("Details");
    expect(harness.replace).toHaveBeenCalledWith("/settings?tab=details&view=x", { scroll: false });
  });

  it("lets the editor guard a tab switch", () => {
    const guard = vi.fn();
    render({ guardChange: guard });
    choose("Notes");
    expect(guard).toHaveBeenCalledOnce();
    expect(tab("Details").dataset.state).toBe("active");
    act(() => {
      guard.mock.calls[0]?.[0]();
    });
    expect(tab("Notes").dataset.state).toBe("active");
  });
});
