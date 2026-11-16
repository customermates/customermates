import type { ReactNode } from "react";
import type { WikiGraph, WikiGraphNode } from "@/features/wiki/wiki-graph.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  getPage: vi.fn(),
  getLinks: vi.fn(),
  pin: vi.fn(),
  reported: [] as unknown[],
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
}));
vi.mock("../../actions", () => ({
  getWikiPageAction: harness.getPage,
  getWikiPageLinksAction: harness.getLinks,
  pinWikiGraphNodeAction: harness.pin,
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement("a", props, children),
}));
vi.mock("@/components/editor/editor", () => ({
  Editor: ({ label }: { label?: string }) => createElement("div", { "data-editor": "" }, label),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (run: () => unknown) => Promise.resolve(run()).catch((error: unknown) => harness.reported.push(error)),
  reportApplicationError: (error: unknown) => harness.reported.push(error),
}));

import { WikiGraphView } from "../wiki-graph-view";

const GUIDE = "10000000-0000-4000-8000-000000000001";
const REFUNDS = "10000000-0000-4000-8000-000000000002";
const PRICING = "10000000-0000-4000-8000-000000000003";

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
    node({
      id: REFUNDS,
      title: "Refunds",
      kind: "procedure",
      whenToUse: "Refund requests.",
      inbound: 1,
      outbound: 2,
      records: 1,
      x: 0.3,
      y: 0.3,
    }),
    node({ id: PRICING, title: "Pricing", inbound: 1, outbound: 1, x: 0.7, y: 0.6, pinned: true }),
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

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function typeInto(input: HTMLInputElement | null, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input?.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("WikiGraphView", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onOpenPage = vi.fn();

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    harness.getPage.mockReset();
    harness.getLinks.mockReset();
    harness.pin.mockReset();
    harness.reported.length = 0;
    onOpenPage.mockReset();
    harness.getPage.mockImplementation((id: string) =>
      Promise.resolve({
        ok: true,
        data: {
          id,
          title: graph.nodes.find((candidate) => candidate.id === id)?.title ?? "",
          markdown: "Body text.",
          kind: id === REFUNDS ? "procedure" : "knowledge",
          whenToUse: id === REFUNDS ? "Refund requests." : null,
          createdAt: updatedAt,
          updatedAt,
        },
      }),
    );
    harness.getLinks.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve({
        ok: true,
        data: {
          id,
          linkedFrom: id === GUIDE ? [{ id: REFUNDS, title: "Refunds", kind: "procedure" }] : [],
          linksTo: id === REFUNDS ? [{ id: GUIDE, title: "Operating Guide", kind: "guide" }] : [],
          missing: id === REFUNDS ? 1 : 0,
          records: [],
        },
      }),
    );
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

  const render = (canPin = true) =>
    act(async () => {
      root.render(createElement(WikiGraphView, { graph, canPin, onOpenPage }));
      await settle();
    });
  const nodeButton = (title: string) =>
    [...container.querySelectorAll<SVGGElement>("[data-wiki-graph-node]")].find((element) =>
      element.getAttribute("aria-label")?.startsWith(`Wiki.graph.nodeLabel:${title}`),
    );
  const press = (title: string) =>
    act(async () => {
      const element = nodeButton(title);
      element?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      element?.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
      await settle();
    });
  const clickButton = (within: ParentNode | null, text: string) =>
    act(async () => {
      [...(within?.querySelectorAll("button") ?? [])].find((button) => button.textContent?.includes(text))?.click();
      await settle();
    });

  it("draws every page as a node and marks pinned pages", async () => {
    await render();
    expect(container.querySelectorAll("[data-wiki-graph-node]")).toHaveLength(3);
    expect(container.querySelectorAll("line")).toHaveLength(3);
    expect(nodeButton("Pricing")?.dataset.wikiGraphPinned).toBe("true");
    expect(nodeButton("Refunds")?.dataset.wikiGraphPinned).toBeUndefined();
    expect(container.querySelector("[data-wiki-graph-drawer]")).toBeNull();
    expect(container.textContent).toContain("Wiki.graph.legendEdit");
  });

  it("fades pages that do not match the search or a hidden kind", async () => {
    await render();
    const input = container.querySelector<HTMLInputElement>("input[type=search]");
    expect(input).not.toBeNull();
    act(() => typeInto(input, "refund"));
    expect(nodeButton("Refunds")?.getAttribute("tabindex")).toBe("0");
    expect(nodeButton("Pricing")?.getAttribute("tabindex")).toBe("-1");
    expect(nodeButton("Pricing")?.classList.contains("opacity-20")).toBe(true);

    act(() => typeInto(input, ""));
    await clickButton(container, "Wiki.kind.knowledge");
    expect(nodeButton("Pricing")?.getAttribute("tabindex")).toBe("-1");
    expect(nodeButton("Refunds")?.getAttribute("tabindex")).toBe("0");
  });

  it("opens the drawer with the page and its links, moves between linked pages and closes on Escape", async () => {
    await render();
    await press("Refunds");
    const drawer = container.querySelector("[data-wiki-graph-drawer]");
    expect(drawer).not.toBeNull();
    expect(harness.getPage).toHaveBeenCalledWith(REFUNDS);
    expect(harness.getLinks).toHaveBeenCalledWith({ id: REFUNDS });
    expect(drawer?.querySelector("h2")?.textContent).toBe("Refunds");
    expect(drawer?.textContent).toContain("Refund requests.");
    expect(drawer?.querySelector("[data-editor]")?.textContent).toBe("Refunds");
    expect(nodeButton("Refunds")?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      const tab = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (candidate) => candidate.textContent === "Wiki.graph.segments.links",
      );
      tab?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      tab?.focus();
      tab?.click();
      await settle();
    });
    expect(drawer?.textContent).toContain("Wiki.graph.linksTo · 1");
    expect(drawer?.textContent).toContain("Wiki.graph.missingLinks:1");
    await clickButton(drawer, "Operating Guide");
    expect(harness.getPage).toHaveBeenCalledWith(GUIDE);
    expect(container.querySelector("[data-wiki-graph-drawer] h2")?.textContent).toBe("Operating Guide");

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector("[data-wiki-graph-drawer]")).toBeNull();
  });

  it("opens the page on request and pins or unpins from the drawer", async () => {
    await render();
    await press("Pricing");
    const drawer = container.querySelector("[data-wiki-graph-drawer]");
    await clickButton(drawer, "Wiki.graph.openPage");
    expect(onOpenPage).toHaveBeenCalledWith(PRICING);

    const unpin = drawer?.querySelector<HTMLButtonElement>('button[aria-label="Wiki.graph.unpin"]');
    expect(unpin).not.toBeNull();
    await act(async () => {
      unpin?.click();
      await settle();
    });
    expect(harness.pin).toHaveBeenCalledWith({ id: PRICING, pinned: false });
    expect(nodeButton("Pricing")?.dataset.wikiGraphPinned).toBeUndefined();
    expect(harness.reported).toEqual([]);
  });

  it("hides pinning for readers", async () => {
    await render(false);
    await press("Pricing");
    expect(container.querySelector('button[aria-label="Wiki.graph.unpin"]')).toBeNull();
    expect(container.textContent).toContain("Wiki.graph.legend");
    expect(container.textContent).not.toContain("Wiki.graph.legendEdit");
  });
});
