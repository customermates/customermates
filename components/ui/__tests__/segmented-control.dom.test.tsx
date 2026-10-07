import type { Root } from "react-dom/client";

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollapsibleSection } from "../collapsible-section";
import { SegmentedControl, SegmentedControlPanel } from "../segmented-control";

type View = "overview" | "notes" | "activities";

let container: HTMLDivElement;
let root: Root;

function Harness() {
  const [value, setValue] = useState<View>("overview");
  return (
    <SegmentedControl<View>
      idPrefix="record"
      items={[
        { value: "overview", label: "Overview" },
        { value: "notes", label: "Notes", invalid: true, invalidLabel: "Has errors" },
        { value: "activities", label: "Activities" },
      ]}
      label="Record views"
      value={value}
      onValueChange={setValue}
    >
      <SegmentedControlPanel value="overview">Overview body</SegmentedControlPanel>

      <SegmentedControlPanel value="notes">Notes body</SegmentedControlPanel>

      <SegmentedControlPanel value="activities">Activities body</SegmentedControlPanel>
    </SegmentedControl>
  );
}

function tabs() {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

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

describe("SegmentedControl", () => {
  it("exposes tabs semantics with one tab stop and labelled panels", () => {
    act(() => root.render(<Harness />));
    const list = document.querySelector<HTMLElement>('[role="tablist"]');
    expect(list?.getAttribute("aria-label")).toBe("Record views");
    expect(list?.tabIndex).toBe(0);
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, -1, -1]);
    expect(tabs()[0]?.id).toBe("record-tab-overview");
    expect(document.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe("record-tab-overview");
    expect(tabs()[1]?.querySelector("[data-tab-error-dot]")).not.toBeNull();
    expect(tabs()[1]?.textContent).toContain("Has errors");
  });

  it("moves selection with the arrow keys", async () => {
    act(() => root.render(<Harness />));
    act(() => tabs()[0]?.focus());
    act(() => {
      tabs()[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    await vi.waitFor(() => expect(document.activeElement).toBe(tabs()[1]));
    expect(tabs()[1]?.dataset.state).toBe("active");
    expect(container.textContent).toContain("Notes body");
  });
});

describe("CollapsibleSection", () => {
  it("shows its summary only while closed and reports aria-expanded", () => {
    act(() =>
      root.render(
        <CollapsibleSection summary="3 options" title="Options">
          <p>Body</p>
        </CollapsibleSection>,
      ),
    );
    const trigger = container.querySelector<HTMLButtonElement>('[data-slot="collapsible-section-trigger"]');
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(trigger?.textContent).toContain("3 options");
    expect(container.textContent).not.toContain("Body");
    act(() => trigger?.click());
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(trigger?.textContent).not.toContain("3 options");
    expect(container.textContent).toContain("Body");
  });
});

describe("SegmentedControl without an id prefix", () => {
  it("keeps Radix's own trigger and panel id pairing", () => {
    act(() =>
      root.render(
        <SegmentedControl
          items={[
            { value: "a", label: "First" },
            { value: "b", label: "Second" },
          ]}
          label="Views"
          value="a"
          onValueChange={() => undefined}
        >
          <SegmentedControlPanel value="a">First body</SegmentedControlPanel>

          <SegmentedControlPanel value="b">Second body</SegmentedControlPanel>
        </SegmentedControl>,
      ),
    );
    const panel = document.querySelector('[role="tabpanel"]');
    const labelledBy = panel?.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy ?? "")?.textContent).toBe("First");
  });
});
