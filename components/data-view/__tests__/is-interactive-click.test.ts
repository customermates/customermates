import type { ComponentType, MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/core/utils/use-is-truncated", () => ({ useIsTruncated: () => false }));

import { AppChip } from "@/components/chip/app-chip";
import { ClickableChip } from "@/components/chip/clickable-chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isInteractiveClick } from "../is-interactive-click";

const TestChip = AppChip as ComponentType<{ children?: ReactNode; variant?: string }>;
const TestClickableChip = ClickableChip as ComponentType<{ children?: ReactNode }>;

function mount(markup: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  document.body.replaceChildren(host);
  return host;
}

function deepestElement(host: HTMLElement): HTMLElement {
  let node = host.firstElementChild as HTMLElement | null;
  while (node?.firstElementChild) node = node.firstElementChild as HTMLElement;
  return node ?? host;
}

function clickOn(target: HTMLElement): boolean {
  return isInteractiveClick({ target } as unknown as ReactMouseEvent<HTMLElement>);
}

describe("isInteractiveClick", () => {
  it("keeps a plain chip out of the interactive set so the row click still fires", () => {
    const host = mount(renderToStaticMarkup(createElement(TestChip, { variant: "success" }, "Active")));

    expect(clickOn(deepestElement(host))).toBe(false);
    expect(host.innerHTML).toContain('data-slot="badge"');
    expect(host.innerHTML).not.toContain('data-slot="tooltip-trigger"');
  });

  it("still suppresses the row click for a chip that is a dropdown trigger", () => {
    const host = mount(
      renderToStaticMarkup(
        createElement(
          DropdownMenu,
          null,
          createElement(
            DropdownMenuTrigger,
            { asChild: true },
            createElement("span", null, createElement(TestClickableChip, null, "Open")),
          ),
          createElement(DropdownMenuContent, null, createElement(DropdownMenuItem, null, "Pick")),
        ),
      ),
    );

    expect(host.innerHTML).toContain('data-slot="dropdown-menu-trigger"');
    expect(clickOn(deepestElement(host))).toBe(true);
  });

  it("still suppresses the row click for ordinary controls", () => {
    const host = mount('<button type="button"><span>Save</span></button>');

    expect(clickOn(deepestElement(host))).toBe(true);
  });
});
