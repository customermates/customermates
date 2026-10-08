import { afterEach, describe, expect, it } from "vitest";

import { hasBlockingOverlay, isTypingTarget, singleKeyShortcutBlocked } from "../key-matching";

function mount(html: string) {
  document.body.innerHTML = html;
}

function keydown(target: Element, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "c",
    code: "KeyC",
    bubbles: true,
    ...init,
  });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("typing contexts", () => {
  it("treats text inputs, textareas, selects and editors as typing", () => {
    mount(`
      <input id="text" type="text" />
      <input id="email" type="email" />
      <input id="checkbox" type="checkbox" />
      <textarea id="area"></textarea>
      <select id="select"><option>a</option></select>
      <div id="editor" contenteditable="true"><p id="paragraph">text</p></div>
      <div id="readonly" contenteditable="false"></div>
      <div id="textbox" role="textbox"></div>
      <div id="combobox" role="combobox"></div>
      <button id="button">b</button>
    `);
    const byId = (id: string) => document.getElementById(id);

    expect(isTypingTarget(byId("text"))).toBe(true);
    expect(isTypingTarget(byId("email"))).toBe(true);
    expect(isTypingTarget(byId("area"))).toBe(true);
    expect(isTypingTarget(byId("select"))).toBe(true);
    expect(isTypingTarget(byId("paragraph"))).toBe(true);
    expect(isTypingTarget(byId("textbox"))).toBe(true);
    expect(isTypingTarget(byId("combobox"))).toBe(true);
    expect(isTypingTarget(byId("checkbox"))).toBe(false);
    expect(isTypingTarget(byId("readonly"))).toBe(false);
    expect(isTypingTarget(byId("button"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("blocks single keys while typing, composing, in menus or listboxes and in the Mate panel", () => {
    mount(`
      <button id="page">page</button>
      <input id="input" />
      <div role="listbox"><div id="option" role="option">x</div></div>
      <aside data-agent-surface role="dialog"><button id="mate">m</button></aside>
    `);
    const byId = (id: string) => document.getElementById(id) as HTMLElement;

    expect(singleKeyShortcutBlocked(keydown(byId("page")), document)).toBe(false);
    expect(singleKeyShortcutBlocked(keydown(byId("input")), document)).toBe(true);
    expect(singleKeyShortcutBlocked(keydown(byId("option")), document)).toBe(true);
    expect(singleKeyShortcutBlocked(keydown(byId("mate")), document)).toBe(true);
    expect(singleKeyShortcutBlocked(keydown(byId("page"), { isComposing: true }), document)).toBe(true);
  });
});

describe("open overlays", () => {
  it("blocks while a dialog, alert dialog or menu is open but not for the Mate panel", () => {
    mount(`<aside data-agent-surface role="dialog"></aside>`);
    expect(hasBlockingOverlay(document)).toBe(false);

    mount(`<div role="dialog" data-state="closed"></div>`);
    expect(hasBlockingOverlay(document)).toBe(false);

    mount(`<div role="dialog" data-state="open"></div>`);
    expect(hasBlockingOverlay(document)).toBe(true);

    mount(`<div role="alertdialog"></div>`);
    expect(hasBlockingOverlay(document)).toBe(true);

    mount(`<div role="menu" data-state="open"></div>`);
    expect(hasBlockingOverlay(document)).toBe(true);
  });
});
