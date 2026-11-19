import { afterEach, describe, expect, it } from "vitest";

import { deckShortcutAllowed } from "../draft-review-shortcuts";

function mount(html: string) {
  document.body.innerHTML = html;
}

function press(target: Element | null, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true, ...init });
  (target ?? document.body).dispatchEvent(event);
  return event;
}

const DECK = `
  <div role="dialog" data-state="open" id="deck">
    <div data-draft-review="">
      <button id="send">Send</button>
      <textarea id="editor"></textarea>
    </div>
    <button id="close">Close</button>
  </div>`;

describe("draft review keyboard shortcuts", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("acts on a key pressed inside the review or with nothing focused", () => {
    mount(DECK);

    expect(deckShortcutAllowed(press(document.querySelector("#send")))).toBe(true);
    expect(deckShortcutAllowed(press(document.querySelector("#close")))).toBe(true);
    expect(deckShortcutAllowed(press(null))).toBe(true);
  });

  it("stays out of the way while the user types, holds a key down or uses a modifier", () => {
    mount(DECK);

    expect(deckShortcutAllowed(press(document.querySelector("#editor")))).toBe(false);
    expect(deckShortcutAllowed(press(document.querySelector("#send"), { repeat: true }))).toBe(false);
    for (const modifier of ["metaKey", "ctrlKey", "altKey", "shiftKey"] as const)
      expect(deckShortcutAllowed(press(document.querySelector("#send"), { [modifier]: true }))).toBe(false);
    expect(deckShortcutAllowed(press(document.querySelector("#send"), { isComposing: true }))).toBe(false);
  });

  it("never sends from a key pressed in the assistant panel or elsewhere on the page", () => {
    mount(`${DECK}
      <div role="dialog" data-agent-surface="" data-state="open"><button id="assistant">Ask</button></div>
      <main><button id="page">Page</button></main>`);

    expect(deckShortcutAllowed(press(document.querySelector("#assistant")))).toBe(false);
    expect(deckShortcutAllowed(press(document.querySelector("#page")))).toBe(false);
    expect(deckShortcutAllowed(press(document.querySelector("#send")))).toBe(true);
  });

  it("waits while a confirmation, a menu or another dialog is open on top", () => {
    for (const layer of [
      '<div role="alertdialog" data-state="open"><button id="confirm">Discard</button></div>',
      '<div role="menu" data-state="open"></div>',
      '<div role="dialog" data-state="open"></div>',
    ]) {
      mount(`${DECK}${layer}`);
      expect(deckShortcutAllowed(press(document.querySelector("#send")))).toBe(false);
    }

    mount(`${DECK}<div role="dialog" data-state="closed"></div>`);
    expect(deckShortcutAllowed(press(document.querySelector("#send")))).toBe(true);
  });

  it("does nothing when the review is not open", () => {
    mount("<main><button id='page'>Page</button></main>");

    expect(deckShortcutAllowed(press(document.querySelector("#page")))).toBe(false);
    expect(deckShortcutAllowed(press(null))).toBe(false);
  });
});
