import type { MouseEvent as ReactMouseEvent } from "react";

const INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[role='checkbox']",
  "[role='menu']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='option']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
  "[aria-haspopup]",
  "[data-slot='dropdown-menu-trigger']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='dropdown-menu-item']",
  "[data-slot='select-trigger']",
  "[data-slot='select-content']",
  "[data-slot='popover-trigger']",
  "[data-slot='popover-content']",
  "[data-slot='tooltip-trigger']",
].join(",");

export function isInteractiveClick(e: ReactMouseEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement | null;
  return Boolean(target?.closest(INTERACTIVE_SELECTOR));
}
