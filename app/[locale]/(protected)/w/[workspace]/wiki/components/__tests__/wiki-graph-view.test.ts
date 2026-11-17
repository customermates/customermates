import type * as TooltipModule from "@/components/ui/tooltip";
import type { ComponentProps } from "react";
import type { WikiGraph, WikiGraphNode } from "@/features/wiki/wiki-graph.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  pin: vi.fn(),
  reported: [] as unknown[],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
}));
vi.mock("../../actions", () => ({
  pinWikiGraphNodeAction: harness.pin,
}));
vi.mock("@/components/ui/tooltip", async (importOriginal) => {
  const actual = await importOriginal<typeof TooltipModule>();
  return {
    ...actual,
    Tooltip: (props: ComponentProps<typeof actual.Tooltip>) =>
      createElement(actual.TooltipProvider, null, createElement(actual.Tooltip, props)),
  };
});
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (run: () => unknown) =>
    Promise.resolve()
      .then(run)
      .catch((error: unknown) => harness.reported.push(error)),
  reportApplicationError: (error: unknown) => harness.reported.push(error),
}));

import { useWikiGraphPositions } from "../use-wiki-graph-positions";
import { WikiGraphView } from "../wiki-graph-view";

const GUIDE = "10000000-0000-4000-8000-000000000001";
const REFUNDS = "10000000-0000-4000-8000-000000000002";
const PRICING = "10000000-0000-4000-8000-000000000003";
const ARCHIVE = "10000000-0000-4000-8000-000000000004";

const updatedAt = new Date("2026-11-16T10:00:00.000Z");
const node = (overrides: Partial<WikiGraphNode> & { id: string; title: string }): WikiGraphNode => ({
  kind: "knowledge",
  whenToUse: null,
  updatedAt,
  inbound: 0,
  outbound: 0,
  missing: 0,
  records: 0,
  x: 0.5,
  y: 0.5,
  pinned: false,
  ...overrides,
});
const graph: WikiGraph = {
  nodes: [
    node({ id: GUIDE, title: "Operating Guide", kind: "guide", inbound: 2 }),
    node({ id: REFUNDS, title: "Refunds", kind: "procedure", inbound: 1, outbound: 2, x: 0.3, y: 0.3 }),
    node({ id: PRICING, title: "Pricing", inbound: 1, outbound: 1, x: 0.7, y: 0.6, pinned: true }),
    node({ id: ARCHIVE, title: "Archive", x: 0.1, y: 0.9 }),
  ],
  links: [
    { source: REFUNDS, target: GUIDE },
    { source: REFUNDS, target: PRICING },
    { source: PRICING, target: GUIDE },
  ],
  recordTypes: [],
  truncated: false,
  syncing: false,
};

type ViewProps = Partial<Pick<ComponentProps<typeof WikiGraphView>, "canPin" | "found" | "query" | "selectedId">> & {
  source?: WikiGraph;
};

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("WikiGraphView", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onSelect = vi.fn();

  function Host({
    source = graph,
    canPin = true,
    found = new Set<string>(),
    query = "",
    selectedId = null,
  }: ViewProps) {
    const positions = useWikiGraphPositions(source);
    return createElement(WikiGraphView, { graph: source, positions, query, found, selectedId, canPin, onSelect });
  }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    harness.pin.mockReset();
    harness.reported.length = 0;
    onSelect.mockReset();
    harness.pin.mockImplementation((data: { id: string; pinned?: false }) =>
      Promise.resolve({ ok: true, data: { id: data.id, pinned: !("pinned" in data) } }),
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (props: ViewProps = {}) =>
    act(async () => {
      root.render(createElement(Host, props));
      await settle();
    });
  const nodeButton = (title: string) =>
    [...container.querySelectorAll<SVGGElement>("[data-wiki-graph-node]")].find((element) =>
      element.getAttribute("aria-label")?.startsWith(`Wiki.graph.nodeLabel:${title}|`),
    );
  const press = (title: string) =>
    act(async () => {
      const element = nodeButton(title);
      element?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      element?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
      await settle();
    });
  const segment = (label: string) =>
    [...container.querySelectorAll<HTMLButtonElement>('[role="tablist"] [role="tab"]')].find((button) =>
      button.textContent?.startsWith(label),
    );
  const choose = (label: string) =>
    act(() => {
      segment(label)?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      segment(label)?.focus();
    });
  const dimmed = (title: string) => nodeButton(title)?.classList.contains("opacity-20");

  it("draws every page as a node in its kind's colour and marks only pinned pages with a pin", async () => {
    await render();
    expect(container.querySelectorAll("[data-wiki-graph-node]")).toHaveLength(4);
    expect(container.querySelectorAll("line")).toHaveLength(3);
    expect(nodeButton("Operating Guide")?.querySelector("circle.fill-foreground")).not.toBeNull();
    expect(nodeButton("Refunds")?.querySelector("circle.fill-info")).not.toBeNull();
    expect(nodeButton("Pricing")?.querySelector("circle.fill-muted-foreground")).not.toBeNull();
    expect(nodeButton("Pricing")?.dataset.wikiGraphPinned).toBe("true");
    expect(nodeButton("Pricing")?.querySelector("[data-wiki-graph-pin]")).not.toBeNull();
    expect(nodeButton("Refunds")?.dataset.wikiGraphPinned).toBeUndefined();
    expect(container.querySelectorAll("[data-wiki-graph-pin]")).toHaveLength(1);
    expect(container.textContent).toContain("Wiki.graph.legendEdit");
  });

  it("holds no search field and no page panel of its own", async () => {
    await render();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector("[data-wiki-graph-drawer]")).toBeNull();
    expect(container.querySelector('button[aria-label="Wiki.graph.fit"]')).not.toBeNull();
  });

  it("filters by page kind with the shared segmented control and keeps the guide in view", async () => {
    await render();
    expect(container.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Wiki.graph.filter.label");
    expect(segment("Wiki.graph.filter.all")?.textContent).toBe("Wiki.graph.filter.all4");
    expect(segment("Wiki.graph.filter.procedure")?.textContent).toBe("Wiki.graph.filter.procedure1");
    expect(segment("Wiki.graph.filter.knowledge")?.textContent).toBe("Wiki.graph.filter.knowledge2");
    expect(segment("Wiki.graph.filter.all")?.getAttribute("aria-selected")).toBe("true");
    expect(segment("Wiki.graph.filter.all")?.hasAttribute("aria-controls")).toBe(false);

    choose("Wiki.graph.filter.procedure");
    expect(segment("Wiki.graph.filter.procedure")?.getAttribute("aria-selected")).toBe("true");
    expect(segment("Wiki.graph.filter.all")?.getAttribute("aria-selected")).toBe("false");
    expect(nodeButton("Refunds")?.getAttribute("tabindex")).toBe("0");
    expect(nodeButton("Operating Guide")?.getAttribute("tabindex")).toBe("0");
    expect(nodeButton("Pricing")?.getAttribute("tabindex")).toBe("-1");
    expect(dimmed("Pricing")).toBe(true);
    expect(dimmed("Archive")).toBe(true);

    choose("Wiki.graph.filter.all");
    expect(dimmed("Pricing")).toBe(false);
  });

  it("fades pages the top bar search does not match, keeps pages found by their text and says when nothing matches", async () => {
    await render({ query: "refund" });
    expect(nodeButton("Refunds")?.getAttribute("tabindex")).toBe("0");
    expect(dimmed("Pricing")).toBe(true);
    expect(dimmed("Operating Guide")).toBe(true);

    await render({ query: "refund", found: new Set([PRICING]) });
    expect(dimmed("Pricing")).toBe(false);
    expect(dimmed("Archive")).toBe(true);

    await render({ query: "nothing like this" });
    expect(container.textContent).toContain("Wiki.graph.noMatches");
    expect(container.textContent).not.toContain("Wiki.graph.legendEdit");
  });

  it("asks to open a page on a click or on Enter, and rings the open page", async () => {
    await render();
    await press("Refunds");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(REFUNDS);
    expect(harness.pin).not.toHaveBeenCalled();

    act(() => {
      nodeButton("Pricing")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onSelect).toHaveBeenLastCalledWith(PRICING);

    await render({ selectedId: REFUNDS });
    expect(nodeButton("Refunds")?.getAttribute("aria-pressed")).toBe("true");
    expect(nodeButton("Refunds")?.querySelectorAll("circle")).toHaveLength(2);
    expect(nodeButton("Pricing")?.getAttribute("aria-pressed")).toBe("false");
    expect(dimmed("Archive")).toBe(true);
    expect(dimmed("Pricing")).toBe(false);
  });

  it("brings a page and the pages it links with forward while it has the focus", async () => {
    await render();
    expect(dimmed("Archive")).toBe(false);
    act(() => {
      nodeButton("Refunds")?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(dimmed("Archive")).toBe(true);
    expect(dimmed("Refunds")).toBe(false);
    expect(dimmed("Operating Guide")).toBe(false);
    act(() => {
      nodeButton("Refunds")?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(dimmed("Archive")).toBe(false);
  });

  it("pins a dragged page, reverts a cancelled drag and restores the place when the pin fails", async () => {
    await render();
    const svg = container.querySelector("svg");
    const before = nodeButton("Refunds")?.getAttribute("transform");
    const drag = (end: "pointerup" | "pointercancel", to = 40) =>
      act(async () => {
        nodeButton("Refunds")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
        svg?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: to, clientY: to }));
        svg?.dispatchEvent(new MouseEvent(end, { bubbles: true, clientX: to, clientY: to }));
        await settle();
      });

    await drag("pointercancel");
    expect(harness.pin).not.toHaveBeenCalled();
    expect(nodeButton("Refunds")?.getAttribute("transform")).toBe(before);
    expect(nodeButton("Refunds")?.dataset.wikiGraphPinned).toBeUndefined();
    expect(onSelect).not.toHaveBeenCalled();

    await drag("pointerup");
    expect(harness.pin).toHaveBeenCalledExactlyOnceWith({ id: REFUNDS, x: 0.025, y: 0.04 });
    expect(nodeButton("Refunds")?.dataset.wikiGraphPinned).toBe("true");
    expect(nodeButton("Refunds")?.querySelector("[data-wiki-graph-pin]")).not.toBeNull();
    expect(nodeButton("Refunds")?.getAttribute("transform")).not.toBe(before);
    expect(onSelect).not.toHaveBeenCalled();

    harness.pin.mockImplementation(() => Promise.reject(new Error("offline")));
    const pinnedAt = nodeButton("Refunds")?.getAttribute("transform");
    await drag("pointerup", 120);
    expect(harness.reported).toHaveLength(1);
    expect(nodeButton("Refunds")?.getAttribute("transform")).toBe(pinnedAt);
    expect(nodeButton("Refunds")?.dataset.wikiGraphPinned).toBe("true");
  });

  it("lets readers open pages but not move them", async () => {
    await render({ canPin: false });
    const svg = container.querySelector("svg");
    const before = nodeButton("Refunds")?.getAttribute("transform");
    await act(async () => {
      nodeButton("Refunds")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      svg?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 40, clientY: 40 }));
      svg?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 40, clientY: 40 }));
      await settle();
    });
    expect(harness.pin).not.toHaveBeenCalled();
    expect(nodeButton("Refunds")?.getAttribute("transform")).toBe(before);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(REFUNDS);
    expect(container.textContent).toContain("Wiki.graph.legend");
    expect(container.textContent).not.toContain("Wiki.graph.legendEdit");
  });

  it("says when the map shows only part of a large Knowledge Base", async () => {
    await render({ source: { ...graph, truncated: true } });
    expect(container.textContent).toContain("Wiki.graph.truncated:4");
  });
});
