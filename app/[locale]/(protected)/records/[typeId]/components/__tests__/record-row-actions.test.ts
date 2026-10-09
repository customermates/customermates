import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RotateCcw } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { TooltipProvider } from "@/components/ui/tooltip";
import { RecordRowActions } from "../record-row-actions";

function render(props: Partial<Parameters<typeof RecordRowActions>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(RecordRowActions, { name: "Acme", onOpen: vi.fn(), onDelete: vi.fn(), ...props }),
    ),
  );
}

function groupLabels(markup: string) {
  const group = markup.slice(markup.indexOf("data-row-action-group"), markup.indexOf("RecordModel.moreActions"));
  return [...group.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
}

describe("row action hover group (rule 63)", () => {
  it("offers Open details, then a red Delete, as inline buttons beside the touch menu", () => {
    const markup = render();

    expect(groupLabels(markup)).toEqual(["RecordModel.openDetails", "Common.actions.delete"]);
    expect(markup).toMatch(
      /aria-label="Common.actions.delete"[^>]*data-variant="destructiveOutline"|data-variant="destructiveOutline"[^>]*aria-label="Common.actions.delete"/,
    );
    expect(markup).toContain('aria-label="RecordModel.moreActions"');
  });

  it("puts the contextual action first and leaves out what the row cannot do", () => {
    const markup = render({
      contextAction: { label: "Restore", icon: RotateCcw, onSelect: vi.fn() },
      onOpen: undefined,
    });

    expect(groupLabels(markup)).toEqual(["Restore", "Common.actions.delete"]);
  });

  it("shows the group only on fine pointers from the md breakpoint and keeps the menu for touch", () => {
    const markup = render();

    expect(markup).toMatch(/class="[^"]*hidden[^"]*md:pointer-fine:flex[^"]*"[^>]*data-row-action-group/);
    expect(markup).toMatch(/class="[^"]*md:pointer-fine:hidden[^"]*"/);
  });
});
