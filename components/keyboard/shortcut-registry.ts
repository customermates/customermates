import type { KeyChord, KeyPress, KeyboardPlatform } from "./key-matching";

import { chordLabel, chordMatches, detectKeyboardPlatform } from "./key-matching";

export type ShortcutGroup = "general" | "navigation" | "create" | "listsAndViews" | "forms";

export type ShortcutId =
  | "search"
  | "searchAlias"
  | "askMate"
  | "shortcuts"
  | "toggleSidebar"
  | "goDashboard"
  | "goInbox"
  | "goKnowledgeBase"
  | "goRoutines"
  | "goConfigure"
  | "goSettings"
  | "add"
  | "goList"
  | "switchView"
  | "openFilters"
  | "save"
  | "close";

export type ShortcutDestination = "dashboard" | "inbox" | "wiki" | "routines" | "configure" | "settings";

export type Shortcut = {
  id: ShortcutId;
  group: ShortcutGroup;
  sequence: readonly KeyChord[];
  destination?: ShortcutDestination;
  alternativeTo?: ShortcutId;
};

export const GO_PREFIX: KeyChord = { key: "g", codes: ["KeyG"] };

export const SHORTCUT_SEQUENCE_TIMEOUT_MS = 1000;

export const LIST_POSITION_CHORDS: readonly KeyChord[] = Array.from({ length: 9 }, (_, index) => ({
  key: String(index + 1),
  codes: [`Digit${index + 1}`, `Numpad${index + 1}`],
}));

function letter(key: string): KeyChord {
  return { key, codes: [`Key${key.toUpperCase()}`] };
}

function goTo(id: ShortcutId, key: string, destination: ShortcutDestination): Shortcut {
  return { id, group: "navigation", sequence: [GO_PREFIX, letter(key)], destination };
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: "search", group: "general", sequence: [{ ...letter("k"), mod: true }] },
  { id: "searchAlias", group: "general", sequence: [{ key: "/", codes: ["Slash"] }], alternativeTo: "search" },
  { id: "askMate", group: "general", sequence: [{ ...letter("j"), mod: true }] },
  { id: "shortcuts", group: "general", sequence: [{ key: "?", codes: ["Slash"], shift: true }] },
  { id: "toggleSidebar", group: "general", sequence: [{ key: "\\", codes: ["Backslash"], mod: true }] },
  goTo("goDashboard", "d", "dashboard"),
  goTo("goInbox", "i", "inbox"),
  goTo("goKnowledgeBase", "k", "wiki"),
  goTo("goRoutines", "r", "routines"),
  goTo("goConfigure", "c", "configure"),
  goTo("goSettings", "s", "settings"),
  { id: "add", group: "create", sequence: [letter("c")] },
  { id: "goList", group: "listsAndViews", sequence: [GO_PREFIX, LIST_POSITION_CHORDS[0]] },
  { id: "switchView", group: "listsAndViews", sequence: [letter("v")] },
  { id: "openFilters", group: "listsAndViews", sequence: [letter("f")] },
  { id: "save", group: "forms", sequence: [{ key: "Enter", codes: ["Enter", "NumpadEnter"], mod: true }] },
  { id: "close", group: "forms", sequence: [{ key: "Escape", codes: ["Escape"] }] },
];

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ["general", "navigation", "create", "listsAndViews", "forms"];

export function shortcut(id: ShortcutId): Shortcut {
  const found = SHORTCUTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown shortcut ${id}`);
  return found;
}

export function isSingleKeyShortcut(entry: Shortcut): boolean {
  const [first] = entry.sequence;
  return !first.mod && first.key.length === 1;
}

export function matchesShortcut(event: KeyPress, id: ShortcutId, platform: KeyboardPlatform): boolean {
  const { sequence } = shortcut(id);
  return sequence.length === 1 && chordMatches(event, sequence[0], platform);
}

export function isShortcutPress(event: KeyPress, id: ShortcutId): boolean {
  return matchesShortcut(event, id, detectKeyboardPlatform(typeof navigator === "undefined" ? undefined : navigator));
}

export function shortcutKeyLabels(id: ShortcutId, platform: KeyboardPlatform): string[] {
  if (id === "goList") return [chordLabel(GO_PREFIX, platform), "1–9"];
  return shortcut(id).sequence.map((chord) => chordLabel(chord, platform));
}

export function goSequenceTarget(
  event: KeyPress,
  platform: KeyboardPlatform,
): { destination: ShortcutDestination } | { listPosition: number } | null {
  const fixed = SHORTCUTS.find(
    (entry) => entry.destination && entry.sequence.length === 2 && chordMatches(event, entry.sequence[1], platform),
  );
  if (fixed?.destination) return { destination: fixed.destination };
  const position = LIST_POSITION_CHORDS.findIndex((chord) => chordMatches(event, chord, platform));
  return position >= 0 ? { listPosition: position } : null;
}
