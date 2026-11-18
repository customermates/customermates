import { isTypingTarget } from "@/components/keyboard/key-matching";

const OPEN_DIALOG_SELECTOR = '[role="dialog"]:not([data-agent-surface]):not([data-state="closed"])';
const OPEN_LAYER_SELECTOR = '[role="alertdialog"]:not([data-state="closed"]),[role="menu"]:not([data-state="closed"])';

export const DRAFT_REVIEW_SELECTOR = "[data-draft-review]";

export function deckShortcutAllowed(event: KeyboardEvent, root: Document = document): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  if (isTypingTarget(event.target)) return false;

  const surface = root.querySelector(DRAFT_REVIEW_SELECTOR)?.closest('[role="dialog"]');
  if (!surface) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (target && target !== root.body && !surface.contains(target)) return false;
  if (root.querySelector(OPEN_LAYER_SELECTOR)) return false;

  return [...root.querySelectorAll(OPEN_DIALOG_SELECTOR)].every((dialog) => dialog === surface);
}
