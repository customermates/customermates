import { describe, expect, it, vi } from "vitest";

import {
  LEMON_SQUEEZY_AFFILIATE_SCRIPT_SRC,
  hasLemonSqueezyReferral,
  scheduleLemonSqueezyAffiliate,
} from "../lemon-squeezy-affiliate";

type Listener = () => void;

function stubPage({ readyState = "complete", search = "" } = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const idle: Listener[] = [];
  const appended: Array<{ async: boolean; src: string }> = [];

  const win = {
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    cancelIdleCallback: vi.fn(),
    location: { search },
    removeEventListener: (type: string, listener: Listener) => listeners.get(type)?.delete(listener),
    requestIdleCallback: (callback: Listener) => idle.push(callback),
  } as unknown as Window;

  const doc = {
    body: { appendChild: (script: { async: boolean; src: string }) => appended.push(script) },
    createElement: () => ({ async: false, src: "" }),
    querySelector: () => (appended.length > 0 ? {} : null),
    readyState,
  } as unknown as Document;

  const fire = (type: string) => {
    for (const listener of [...(listeners.get(type) ?? [])]) listener();
  };

  return { appended, doc, fire, idle, listeners, win };
}

describe("Lemon Squeezy affiliate script", () => {
  it("recognises the referral parameter on the landing URL", () => {
    expect(hasLemonSqueezyReferral("?aff=abc123")).toBe(true);
    expect(hasLemonSqueezyReferral("?utm_source=newsletter")).toBe(false);
    expect(hasLemonSqueezyReferral("")).toBe(false);
  });

  it("loads at once when the visitor lands through an affiliate link, before any client navigation can drop the code", () => {
    const page = stubPage({ search: "?aff=abc123" });

    scheduleLemonSqueezyAffiliate(page.win, page.doc);

    expect(page.appended).toEqual([{ async: true, src: LEMON_SQUEEZY_AFFILIATE_SCRIPT_SRC }]);
    expect(page.win).toHaveProperty("lemonSqueezyAffiliateConfig", { store: "customermates" });
  });

  it("keeps an ordinary visit's request off the critical path until the page is idle", () => {
    const page = stubPage();

    scheduleLemonSqueezyAffiliate(page.win, page.doc);

    expect(page.appended).toHaveLength(0);
    expect(page.idle).toHaveLength(1);

    page.idle[0]();

    expect(page.appended).toHaveLength(1);
  });

  it("waits for the load event before scheduling the idle request", () => {
    const page = stubPage({ readyState: "interactive" });

    scheduleLemonSqueezyAffiliate(page.win, page.doc);
    expect(page.idle).toHaveLength(0);

    page.fire("load");
    expect(page.idle).toHaveLength(1);
  });

  it("loads on the first interaction and only once", () => {
    const page = stubPage({ readyState: "interactive" });

    scheduleLemonSqueezyAffiliate(page.win, page.doc);
    page.fire("pointerdown");
    page.fire("keydown");
    page.fire("load");

    expect(page.appended).toHaveLength(1);
    expect(page.idle).toHaveLength(0);
  });

  it("requests nothing once the layout unmounts first", () => {
    const page = stubPage();

    const cleanup = scheduleLemonSqueezyAffiliate(page.win, page.doc);
    cleanup();
    page.idle[0]?.();

    expect(page.appended).toHaveLength(0);
  });
});
