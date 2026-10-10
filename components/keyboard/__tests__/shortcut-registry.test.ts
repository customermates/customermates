import { describe, expect, it } from "vitest";

import { chordLabel, chordMatches, detectKeyboardPlatform, type KeyPress } from "../key-matching";
import {
  GO_PREFIX,
  SHORTCUTS,
  SHORTCUT_GROUPS,
  goSequenceTarget,
  isSingleKeyShortcut,
  matchesShortcut,
  shortcut,
  shortcutKeyLabels,
} from "../shortcut-registry";

function press(key: string, code: string, modifiers: Partial<KeyPress> = {}): KeyPress {
  return {
    key,
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

describe("keyboard platform", () => {
  it("detects Apple platforms from userAgentData, platform or user agent", () => {
    expect(detectKeyboardPlatform({ userAgentData: { platform: "macOS" } })).toBe("mac");
    expect(detectKeyboardPlatform({ platform: "MacIntel" })).toBe("mac");
    expect(detectKeyboardPlatform({ platform: "iPad" })).toBe("mac");
    expect(detectKeyboardPlatform({ platform: "Win32" })).toBe("other");
    expect(detectKeyboardPlatform({ platform: "Linux x86_64" })).toBe("other");
    expect(detectKeyboardPlatform(undefined)).toBe("other");
  });
});

describe("modified shortcuts", () => {
  it("uses Cmd on Mac and Ctrl elsewhere, never the other modifier", () => {
    expect(matchesShortcut(press("k", "KeyK", { metaKey: true }), "search", "mac")).toBe(true);
    expect(matchesShortcut(press("k", "KeyK", { ctrlKey: true }), "search", "mac")).toBe(false);
    expect(matchesShortcut(press("k", "KeyK", { ctrlKey: true }), "search", "other")).toBe(true);
    expect(matchesShortcut(press("k", "KeyK", { metaKey: true }), "search", "other")).toBe(false);
    expect(matchesShortcut(press("j", "KeyJ", { ctrlKey: true }), "askMate", "other")).toBe(true);
    expect(matchesShortcut(press("k", "KeyK"), "search", "other")).toBe(false);
  });

  it("does not match with extra Alt or Shift", () => {
    expect(matchesShortcut(press("k", "KeyK", { ctrlKey: true, altKey: true }), "search", "other")).toBe(false);
    expect(matchesShortcut(press("K", "KeyK", { ctrlKey: true, shiftKey: true }), "search", "other")).toBe(false);
  });

  it("falls back to the physical key on non-Latin layouts", () => {
    expect(matchesShortcut(press("л", "KeyK", { ctrlKey: true }), "search", "other")).toBe(true);
    expect(matchesShortcut(press("о", "KeyJ", { metaKey: true }), "askMate", "mac")).toBe(true);
    expect(matchesShortcut(press("ㅏ", "KeyK", { metaKey: true }), "search", "mac")).toBe(true);
  });

  it("follows the produced letter on Latin layouts such as Dvorak", () => {
    expect(matchesShortcut(press("t", "KeyK", { ctrlKey: true }), "search", "other")).toBe(false);
    expect(matchesShortcut(press("k", "KeyV", { ctrlKey: true }), "search", "other")).toBe(true);
  });

  it("toggles the sidebar with Cmd/Ctrl+\\ and never with Cmd/Ctrl+B or AltGr", () => {
    expect(matchesShortcut(press("\\", "Backslash", { metaKey: true }), "toggleSidebar", "mac")).toBe(true);
    expect(matchesShortcut(press("\\", "Backslash", { ctrlKey: true }), "toggleSidebar", "other")).toBe(true);
    expect(matchesShortcut(press("#", "Backslash", { ctrlKey: true }), "toggleSidebar", "other")).toBe(true);
    expect(matchesShortcut(press("\\", "Minus", { ctrlKey: true, altKey: true }), "toggleSidebar", "other")).toBe(
      false,
    );
    expect(matchesShortcut(press("b", "KeyB", { ctrlKey: true }), "toggleSidebar", "other")).toBe(false);
  });

  it("matches Cmd/Ctrl+Enter on both Enter keys and Escape alone", () => {
    expect(matchesShortcut(press("Enter", "Enter", { metaKey: true }), "save", "mac")).toBe(true);
    expect(matchesShortcut(press("Enter", "NumpadEnter", { ctrlKey: true }), "save", "other")).toBe(true);
    expect(matchesShortcut(press("Enter", "Enter"), "save", "other")).toBe(false);
    expect(matchesShortcut(press("Escape", "Escape"), "close", "other")).toBe(true);
    expect(matchesShortcut(press("Escape", "Escape", { ctrlKey: true }), "close", "other")).toBe(false);
  });
});

describe("single-key shortcuts", () => {
  it("matches C and ? without modifiers", () => {
    expect(matchesShortcut(press("c", "KeyC"), "add", "other")).toBe(true);
    expect(matchesShortcut(press("C", "KeyC", { shiftKey: true }), "add", "other")).toBe(false);
    expect(matchesShortcut(press("c", "KeyC", { metaKey: true }), "add", "mac")).toBe(false);
    expect(matchesShortcut(press("?", "Slash", { shiftKey: true }), "shortcuts", "other")).toBe(true);
    expect(matchesShortcut(press("?", "Minus", { shiftKey: true }), "shortcuts", "other")).toBe(true);
    expect(matchesShortcut(press("_", "Slash", { shiftKey: true }), "shortcuts", "other")).toBe(false);
    expect(matchesShortcut(press("с", "KeyC"), "add", "other")).toBe(true);
  });

  it("matches / as a search alias and V for the view picker", () => {
    expect(matchesShortcut(press("/", "Slash"), "searchAlias", "other")).toBe(true);
    expect(matchesShortcut(press("/", "Digit7", { shiftKey: true }), "searchAlias", "other")).toBe(true);
    expect(matchesShortcut(press("?", "Slash", { shiftKey: true }), "searchAlias", "other")).toBe(false);
    expect(matchesShortcut(press("/", "Slash", { ctrlKey: true }), "searchAlias", "other")).toBe(false);
    expect(matchesShortcut(press("v", "KeyV"), "switchView", "other")).toBe(true);
    expect(matchesShortcut(press("м", "KeyV"), "switchView", "other")).toBe(true);
    expect(matchesShortcut(press("v", "KeyV", { metaKey: true }), "switchView", "mac")).toBe(false);
  });

  it("matches F for the filters of the current list, on any layout and never with a modifier", () => {
    expect(matchesShortcut(press("f", "KeyF"), "openFilters", "other")).toBe(true);
    expect(matchesShortcut(press("а", "KeyF"), "openFilters", "other")).toBe(true);
    expect(matchesShortcut(press("f", "KeyF", { metaKey: true }), "openFilters", "mac")).toBe(false);
    expect(matchesShortcut(press("f", "KeyF", { ctrlKey: true }), "openFilters", "other")).toBe(false);
    expect(shortcutKeyLabels("openFilters", "mac")).toEqual(["F"]);
    expect(SHORTCUTS.filter(isSingleKeyShortcut).map((entry) => entry.id)).toContain("openFilters");
  });

  it("never matches during IME composition", () => {
    expect(matchesShortcut(press("c", "KeyC", { isComposing: true }), "add", "other")).toBe(false);
    expect(matchesShortcut(press("Process", "KeyC", { keyCode: 229 }), "add", "other")).toBe(false);
    expect(matchesShortcut(press("k", "KeyK", { metaKey: true, isComposing: true }), "search", "mac")).toBe(false);
  });

  it("only marks printable unmodified keys as single-key shortcuts", () => {
    const single = SHORTCUTS.filter(isSingleKeyShortcut).map((entry) => entry.id);
    expect(single).toEqual(
      expect.arrayContaining(["add", "shortcuts", "searchAlias", "switchView", "goDashboard", "goList"]),
    );
    expect(single).not.toContain("toggleSidebar");
    expect(single).not.toEqual(expect.arrayContaining(["search"]));
    expect(single).not.toContain("close");
    expect(single).not.toContain("save");
  });
});

describe("G sequences", () => {
  it("resolves mnemonic letters and list positions", () => {
    expect(chordMatches(press("g", "KeyG"), GO_PREFIX, "other")).toBe(true);
    expect(goSequenceTarget(press("d", "KeyD"), "other")).toEqual({
      destination: "dashboard",
    });
    expect(goSequenceTarget(press("i", "KeyI"), "other")).toEqual({
      destination: "inbox",
    });
    expect(goSequenceTarget(press("k", "KeyK"), "other")).toEqual({
      destination: "wiki",
    });
    expect(goSequenceTarget(press("r", "KeyR"), "other")).toEqual({
      destination: "routines",
    });
    expect(goSequenceTarget(press("c", "KeyC"), "other")).toEqual({
      destination: "configure",
    });
    expect(goSequenceTarget(press("s", "KeyS"), "other")).toEqual({
      destination: "settings",
    });
    expect(goSequenceTarget(press("1", "Digit1"), "other")).toEqual({
      listPosition: 0,
    });
    expect(goSequenceTarget(press("9", "Numpad9"), "other")).toEqual({
      listPosition: 8,
    });
    expect(goSequenceTarget(press("x", "KeyX"), "other")).toBeNull();
    expect(goSequenceTarget(press("0", "Digit0"), "other")).toBeNull();
  });

  it("ignores numpad navigation keys when NumLock is off", () => {
    expect(goSequenceTarget(press("End", "Numpad1"), "other")).toBeNull();
    expect(goSequenceTarget(press("ArrowDown", "Numpad2"), "other")).toBeNull();
  });

  it("reads list digits by position on AZERTY and letters by key on Cyrillic", () => {
    expect(goSequenceTarget(press("&", "Digit1"), "other")).toEqual({
      listPosition: 0,
    });
    expect(goSequenceTarget(press("в", "KeyD"), "other")).toEqual({
      destination: "dashboard",
    });
  });

  it("uses unique second keys", () => {
    const seconds = SHORTCUTS.filter((entry) => entry.destination).map((entry) => entry.sequence[1].key);
    expect(new Set(seconds).size).toBe(seconds.length);
  });
});

describe("labels", () => {
  it("groups every shortcut in the reference order", () => {
    expect(SHORTCUT_GROUPS).toEqual(["general", "navigation", "create", "listsAndViews", "forms"]);
    expect(SHORTCUTS.every((entry) => SHORTCUT_GROUPS.includes(entry.group))).toBe(true);
    expect(SHORTCUTS.some((entry) => entry.sequence.some((chord) => chord.mod && /^\d$/.test(chord.key)))).toBe(false);
  });

  it("prints the platform modifier", () => {
    expect(shortcutKeyLabels("search", "mac")).toEqual(["⌘K"]);
    expect(shortcutKeyLabels("search", "other")).toEqual(["Ctrl+K"]);
    expect(shortcutKeyLabels("askMate", "other")).toEqual(["Ctrl+J"]);
    expect(shortcutKeyLabels("toggleSidebar", "mac")).toEqual(["⌘\\"]);
    expect(shortcutKeyLabels("toggleSidebar", "other")).toEqual(["Ctrl+\\"]);
    expect(shortcutKeyLabels("searchAlias", "other")).toEqual(["/"]);
    expect(shortcutKeyLabels("switchView", "mac")).toEqual(["V"]);
    expect(shortcutKeyLabels("save", "mac")).toEqual(["⌘↵"]);
    expect(shortcutKeyLabels("save", "other")).toEqual(["Ctrl+Enter"]);
    expect(shortcutKeyLabels("close", "mac")).toEqual(["Esc"]);
    expect(shortcutKeyLabels("goDashboard", "other")).toEqual(["G", "D"]);
    expect(shortcutKeyLabels("goList", "mac")).toEqual(["G", "1–9"]);
    expect(shortcutKeyLabels("shortcuts", "mac")).toEqual(["?"]);
    expect(chordLabel(shortcut("add").sequence[0], "mac")).toBe("C");
  });
});
