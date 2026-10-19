import type { ReactElement } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: unknown }) => children,
  Tooltip: ({ children }: { children: unknown }) => children,
  TooltipTrigger: ({ children }: { children: unknown }) => children,
  TooltipContent: () => null,
}));

import { DashboardSketch, KnowledgePageList, PipelineBoard } from "../setup-preview-parts";

const CLAMPED = /(?:^|\s)(?:truncate|line-clamp-\d+)(?:\s|$)/;

let container: HTMLDivElement;
let root: Root;

function render(element: ReactElement) {
  act(() => root.render(element));
}

function elementWithText(text: string) {
  const found = [...container.querySelectorAll<HTMLElement>("*")].find(
    (candidate) => candidate.children.length === 0 && candidate.textContent === text,
  );
  if (!found) throw new Error(`${text} did not render.`);
  return found;
}

function clampedAncestors(element: HTMLElement) {
  const clamped: string[] = [];
  for (let current: HTMLElement | null = element; current && current !== container; current = current.parentElement)
    if (CLAMPED.test(current.className)) clamped.push(current.className);
  return clamped;
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

describe("setup preview parts", () => {
  it("shows every dashboard tile title in full instead of cutting it off", () => {
    const titles = ["Pipeline value", "Recurring revenue this quarter", "Renewals due in the next 90 days"];
    render(
      createElement(DashboardSketch, {
        tiles: titles.map((title, index) => ({
          key: `w${index}`,
          title,
          display: index === 2 ? "verticalBarChart" : "number",
        })),
      }),
    );

    for (const title of titles) expect(clampedAncestors(elementWithText(title))).toEqual([]);
  });

  it("shows every Knowledge Base page title in full", () => {
    const titles = ["Sales Pipeline and Deal Tracking in Brightwave Cloud", "Voice and Tone"];
    render(createElement(KnowledgePageList, { titles }));

    for (const title of titles) expect(clampedAncestors(elementWithText(title))).toEqual([]);
  });

  it("places each built record under its own stage", () => {
    render(
      createElement(PipelineBoard, {
        stages: [
          { label: "New lead", color: null },
          { label: "Won", color: "success" },
        ],
        records: [
          { title: "Parkview order", stage: "Won" },
          { title: "Maple inquiry", stage: "New lead" },
          { title: "Elbe order", stage: "Won" },
        ],
      }),
    );

    const columns = [...container.querySelectorAll<HTMLElement>(":scope > div > div")].map((column) =>
      column.textContent?.trim(),
    );
    expect(columns).toEqual(["New leadMaple inquiry", "WonParkview orderElbe order"]);
  });

  it("lets a stage's win chance wrap below its label instead of squeezing the label", () => {
    render(
      createElement(PipelineBoard, {
        stages: [
          { label: "Proposal sent", color: "info", weight: 40 },
          { label: "Won", color: "success", weight: 100 },
        ],
      }),
    );

    const label = elementWithText("Proposal sent");
    const header = elementWithText("WorkspaceSetup.plan.winChanceValue 40").parentElement;
    expect(header?.contains(label)).toBe(true);
    expect(header?.className).toContain("flex-wrap");
  });
});
