import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { DataViewItemLayout } from "@/components/data-view/data-view-item-layout";
import { ITEM_ACTIONS_TRIGGER_CLASS } from "@/components/ui/item-actions";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RowActions } from "../row-actions";

function render(props: Partial<Parameters<typeof RowActions>[0]> = {}, layout: "row" | "card" | "table" = "row") {
  return renderToStaticMarkup(
    createElement(
      DataViewItemLayout.Provider,
      { value: layout },
      createElement(
        TooltipProvider,
        null,
        createElement(RowActions, { name: "Acme", onOpen: vi.fn(), onDelete: vi.fn(), ...props }),
      ),
    ),
  );
}

function buttonLabels(markup: string) {
  return [...markup.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
}

describe("record row actions (H9 item menu pattern)", () => {
  it("renders one shared More actions trigger instead of an inline button group", () => {
    const markup = render();

    expect(buttonLabels(markup)).toEqual(["RecordModel.moreActions"]);
    expect(markup).not.toContain("data-row-action-group");
    expect(markup).toContain("data-item-actions-trigger");
  });

  it("hides the trigger with the shared input-capability rule, not a width or pointer variant of its own", () => {
    const markup = render();

    for (const token of ITEM_ACTIONS_TRIGGER_CLASS.split(" ")) expect(markup).toContain(token);
    expect(markup).not.toMatch(/md:pointer-fine|any-pointer-coarse:opacity-100/);
  });

  it("overlays the row's trailing edge in tables and sits in the card corner slot on cards", () => {
    expect(render()).toMatch(/class="[^"]*absolute[^"]*right-2[^"]*"[^>]*data-record-row-actions/);
    expect(render({}, "card")).not.toMatch(/class="[^"]*absolute[^"]*"[^>]*data-record-row-actions/);
  });

  it("insets a bordered trigger on a solid row-tall backing strip at a table row's right edge (H17, H33)", () => {
    const markup = render({}, "table");
    const surface = /<div class="([^"]*)"[^>]*data-record-row-actions/.exec(markup)?.[1].split(" ") ?? [];
    const trigger = /<button[^>]*class="([^"]*)"[^>]*data-item-actions-trigger/.exec(markup)?.[1].split(" ") ?? [];

    expect(surface).toEqual(
      expect.arrayContaining(["absolute", "inset-y-0", "right-0", "p-1", "bg-[var(--row-surface,var(--background))]"]),
    );
    expect(surface).not.toContain("right-2");
    expect(surface.some((token) => token.startsWith("bg-[image:") && token.includes("--row-tint"))).toBe(true);
    expect(trigger).toEqual(
      expect.arrayContaining(["border", "bg-[var(--row-surface,var(--background))]", "h-full", "aspect-square"]),
    );
    expect(trigger.some((token) => token.startsWith("focus-visible:ring"))).toBe(true);
    expect(trigger).not.toContain("size-7");
  });
});
