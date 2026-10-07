import { ASSISTANT_SURFACE_SELECTOR } from "@/components/modal/assistant-surface";

export type KeyboardPlatform = "mac" | "other";

export type KeyChord = {
  key: string;
  codes: readonly string[];
  mod?: boolean;
  shift?: boolean;
};

export type KeyPress = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> & {
  isComposing?: boolean;
  keyCode?: number;
};

const IME_PROCESS_KEY_CODE = 229;
const PRINTABLE_ASCII = /^[\x20-\x7e]$/;
const LETTER_OR_DIGIT = /^[a-z0-9]$/i;
const DIGIT = /^[0-9]$/;

const TEXT_ENTRY_SELECTOR = [
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="spinbutton"]',
].join(",");

const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "radio",
  "submit",
  "reset",
  "range",
  "color",
  "file",
  "image",
]);

const TYPEAHEAD_WIDGET_SELECTOR = '[role="menu"],[role="menubar"],[role="listbox"],[role="tree"],[cmdk-root]';

const BLOCKING_OVERLAY_SELECTOR = [
  '[role="dialog"]:not([data-agent-surface]):not([data-state="closed"])',
  '[role="alertdialog"]:not([data-state="closed"])',
  '[role="menu"]:not([data-state="closed"])',
].join(",");

export function detectKeyboardPlatform(
  navigatorLike:
    | {
        platform?: string;
        userAgent?: string;
        userAgentData?: { platform?: string };
      }
    | undefined,
): KeyboardPlatform {
  const platform = navigatorLike?.userAgentData?.platform || navigatorLike?.platform || navigatorLike?.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "mac" : "other";
}

export function isComposingKeyPress(event: KeyPress): boolean {
  return event.isComposing === true || event.keyCode === IME_PROCESS_KEY_CODE || event.key === "Process";
}

function modifiersMatch(event: KeyPress, chord: KeyChord, platform: KeyboardPlatform): boolean {
  if (event.altKey) return false;
  if (!chord.mod) return !event.metaKey && !event.ctrlKey;
  return platform === "mac" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

function producesItsOwnShift(key: string): boolean {
  return key.length === 1 && !LETTER_OR_DIGIT.test(key);
}

function matchesByKey(event: KeyPress, chord: KeyChord): boolean {
  if (event.key.toLowerCase() !== chord.key.toLowerCase()) return false;
  return producesItsOwnShift(chord.key) || event.shiftKey === Boolean(chord.shift);
}

function matchesByCode(event: KeyPress, chord: KeyChord): boolean {
  if (!chord.codes.includes(event.code) || event.key.length !== 1) return false;
  const positional = DIGIT.test(chord.key);
  const nonLatinLayout = !PRINTABLE_ASCII.test(event.key);
  if (!positional && !nonLatinLayout) return false;
  return event.shiftKey === Boolean(chord.shift);
}

export function chordMatches(event: KeyPress, chord: KeyChord, platform: KeyboardPlatform): boolean {
  if (isComposingKeyPress(event)) return false;
  if (!modifiersMatch(event, chord, platform)) return false;
  return matchesByKey(event, chord) || matchesByCode(event, chord);
}

function asElement(target: EventTarget | null): Element | null {
  if (!target || typeof Element === "undefined") return null;
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = asElement(target);
  if (!element) return false;
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(element.type);
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  return element.closest(TEXT_ENTRY_SELECTOR) !== null;
}

export function isInsideTypeaheadWidget(target: EventTarget | null): boolean {
  return asElement(target)?.closest(TYPEAHEAD_WIDGET_SELECTOR) != null;
}

export function isInsideAssistantSurface(target: EventTarget | null): boolean {
  return asElement(target)?.closest(ASSISTANT_SURFACE_SELECTOR) != null;
}

export function hasBlockingOverlay(root: ParentNode): boolean {
  return root.querySelector(BLOCKING_OVERLAY_SELECTOR) !== null;
}

export function singleKeyShortcutBlocked(event: KeyPress & { target: EventTarget | null }, root: ParentNode): boolean {
  return (
    isComposingKeyPress(event) ||
    isTypingTarget(event.target) ||
    isInsideTypeaheadWidget(event.target) ||
    isInsideAssistantSurface(event.target) ||
    hasBlockingOverlay(root)
  );
}

const MAC_KEY_SYMBOLS: Record<string, string> = { Enter: "↵", Escape: "Esc" };
const OTHER_KEY_NAMES: Record<string, string> = {
  Enter: "Enter",
  Escape: "Esc",
};

export function chordLabel(chord: KeyChord, platform: KeyboardPlatform): string {
  const names = platform === "mac" ? MAC_KEY_SYMBOLS : OTHER_KEY_NAMES;
  const key = names[chord.key] ?? chord.key.toUpperCase();
  if (!chord.mod) return key;
  return platform === "mac" ? `⌘${key}` : `Ctrl+${key}`;
}
