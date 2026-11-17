import { describe, expect, it, vi } from "vitest";

import { BookingPanelStore } from "../booking/booking-panel.store";
import {
  bookingPublicPath,
  canCreateBookingPage,
  groupBookingLinks,
  wantsBookingPanel,
} from "../booking/booking-panel-model";

import { bookingLink, READY_SETUP } from "./booking-fixtures";

const MINE = bookingLink();
const ADA = bookingLink({
  id: "20000000-0000-4000-8000-000000000002",
  title: "Support",
  ownerName: "Ada Lovelace",
  own: false,
});
const ADA_SECOND = bookingLink({
  id: "20000000-0000-4000-8000-000000000003",
  title: "Demo",
  ownerName: "Ada Lovelace",
  own: false,
});
const ALAN = bookingLink({
  id: "20000000-0000-4000-8000-000000000004",
  title: "Office hours",
  ownerName: "Alan Turing",
  own: false,
});

function build(links = [MINE, ADA]) {
  const actions = {
    setEnabled: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
    refresh: vi.fn(),
  };
  return { actions, store: new BookingPanelStore(links, actions) };
}

describe("booking panel model", () => {
  it("opens only for the panel parameter the old settings route redirects to", () => {
    expect(wantsBookingPanel("booking")).toBe(true);
    expect(wantsBookingPanel("sources")).toBe(false);
    expect(wantsBookingPanel(undefined)).toBe(false);
    expect(wantsBookingPanel(["booking"])).toBe(false);
  });

  it("shows the visitor path without the host", () => {
    expect(bookingPublicPath("https://app.example.com/book/tok_abc")).toBe("/book/tok_abc");
  });

  it("puts the caller's own pages first and groups the others by owner name", () => {
    const groups = groupBookingLinks([ADA, MINE, ALAN, ADA_SECOND]);

    expect(groups.own.map((link) => link.id)).toEqual([MINE.id]);
    expect(groups.others.map((group) => group.ownerName)).toEqual(["Ada Lovelace", "Alan Turing"]);
    expect(groups.others[0].links.map((link) => link.id)).toEqual([ADA.id, ADA_SECOND.id]);
  });

  it("allows a new page only when a calendar is ready", () => {
    expect(canCreateBookingPage({ status: "ready", links: [], setup: READY_SETUP })).toBe(true);
    expect(
      canCreateBookingPage({ status: "ready", links: [], setup: { ...READY_SETUP, blockedReason: "noCalendar" } }),
    ).toBe(false);
    expect(canCreateBookingPage({ status: "unavailable", reason: "selfHosted" })).toBe(false);
  });
});

describe("BookingPanelStore", () => {
  it("switches a page off at once, saves it and asks the page to refresh", async () => {
    const { store, actions } = build();

    const pending = store.toggle(MINE.id, false);
    expect(store.links.find((link) => link.id === MINE.id)?.enabled).toBe(false);
    expect(store.pending.has(MINE.id)).toBe(true);

    expect(await pending).toBe(true);
    expect(actions.setEnabled).toHaveBeenCalledExactlyOnceWith(MINE.id, false);
    expect(actions.refresh).toHaveBeenCalledOnce();
    expect(store.pending.has(MINE.id)).toBe(false);
  });

  it("puts the switch back when the save fails and does not refresh", async () => {
    const { store, actions } = build();
    actions.setEnabled.mockResolvedValueOnce(false);

    expect(await store.toggle(MINE.id, false)).toBe(false);

    expect(store.links.find((link) => link.id === MINE.id)?.enabled).toBe(true);
    expect(store.pending.has(MINE.id)).toBe(false);
    expect(actions.refresh).not.toHaveBeenCalled();
  });

  it("puts the switch back when the save throws", async () => {
    const { store, actions } = build();
    actions.setEnabled.mockRejectedValueOnce(new Error("offline"));

    await expect(store.toggle(MINE.id, false)).rejects.toThrow("offline");

    expect(store.links.find((link) => link.id === MINE.id)?.enabled).toBe(true);
    expect(store.pending.has(MINE.id)).toBe(false);
  });

  it("ignores a second switch while one is saving and never changes another person's page", async () => {
    const { store, actions } = build();

    const first = store.toggle(MINE.id, false);
    expect(await store.toggle(MINE.id, true)).toBe(false);
    await first;
    expect(await store.toggle(ADA.id, false)).toBe(false);

    expect(actions.setEnabled).toHaveBeenCalledOnce();
    expect(store.links.find((link) => link.id === ADA.id)?.enabled).toBe(true);
  });

  it("removes a page after the server confirmed and keeps it when the delete fails", async () => {
    const { store, actions } = build();
    actions.remove.mockResolvedValueOnce(false);

    expect(await store.remove(MINE.id)).toBe(false);
    expect(store.links.map((link) => link.id)).toEqual([MINE.id, ADA.id]);
    expect(actions.refresh).not.toHaveBeenCalled();

    expect(await store.remove(MINE.id)).toBe(true);
    expect(store.links.map((link) => link.id)).toEqual([ADA.id]);
    expect(actions.refresh).toHaveBeenCalledOnce();
    expect(await store.remove(ADA.id)).toBe(false);
    expect(actions.remove).toHaveBeenCalledTimes(2);
  });

  it("takes the server's list after a refresh", () => {
    const { store } = build();

    store.sync([ALAN]);

    expect(store.groups.own).toEqual([]);
    expect(store.groups.others.map((group) => group.ownerName)).toEqual(["Alan Turing"]);
  });
});
