import { describe, expect, it, vi } from "vitest";

import { SURFACE, ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { AgentViewContext } from "../agent-view-context";

const VIEW_ID = "b6319ec8-d1b5-4844-bba4-c8c0ca819214";
const RECORD_ID = "47e3aafd-9af8-44f5-a198-50e0094e0785";

describe("agent saved-view context", () => {
  it("settles pending saves only for the same captured view and page", async () => {
    const context = new AgentViewContext();
    const prepare = vi.fn(() => Promise.resolve());
    context.register("/en/contacts", () => ({ surfaceKey: SURFACE.contacts, viewKey: VIEW_ID }), prepare);
    await context.prepare(context.route("/en/contacts"));
    expect(prepare).toHaveBeenCalledOnce();
    await context.prepare("/en/deals?view=__all__&viewSurface=deals-card-store");
    await context.prepare("/en/contacts?view=__all__&viewSurface=contacts-card-store");
    expect(prepare).toHaveBeenCalledOnce();
  });
  it("reads the current selection at send time without leaking other URL values", () => {
    const context = new AgentViewContext();
    let viewKey = ALL_VIEW_KEY;
    context.register("/en/contacts", () => ({ surfaceKey: SURFACE.contacts, viewKey }));
    expect(context.route("/en/contacts")).toBe("/en/contacts?view=__all__&viewSurface=contacts-card-store");
    viewKey = VIEW_ID;
    expect(context.route("/en/contacts")).toContain(`view=${VIEW_ID}`);
    expect(context.route("/en/deals")).toBe("/en/deals");
  });

  it("does not let an old unmount remove the incoming page registration", () => {
    const context = new AgentViewContext();
    const old = context.register("/en/contacts", () => ({ surfaceKey: SURFACE.contacts, viewKey: VIEW_ID }));
    const current = context.register("/en/deals", () => ({ surfaceKey: SURFACE.deals, viewKey: ALL_VIEW_KEY }));
    old();
    expect(context.route("/en/deals")).toContain("viewSurface=deals-card-store");
    current();
    expect(context.route("/en/deals")).toBe("/en/deals");
  });

  it("restores the mounted page owner and its save callback after an explicit detail owner leaves", async () => {
    const context = new AgentViewContext();
    const pagePrepare = vi.fn(() => Promise.resolve());
    const detailPrepare = vi.fn(() => Promise.resolve());
    const releasePage = context.register(
      "/en/contacts",
      () => ({ surfaceKey: SURFACE.contacts, viewKey: VIEW_ID }),
      pagePrepare,
    );
    const pageRoute = context.route("/en/contacts");
    const releaseDetail = context.register(
      "/en/contacts",
      () => ({ surfaceKey: SURFACE.entityTimeline, viewKey: ALL_VIEW_KEY }),
      detailPrepare,
    );
    const detailRoute = context.route("/en/contacts");
    await context.prepare(detailRoute);
    expect(detailPrepare).toHaveBeenCalledOnce();
    expect(pagePrepare).not.toHaveBeenCalled();
    releaseDetail();
    expect(context.route("/en/contacts")).toBe(pageRoute);
    await context.prepare(detailRoute);
    expect(detailPrepare).toHaveBeenCalledOnce();
    await context.prepare(pageRoute);
    expect(pagePrepare).toHaveBeenCalledOnce();
    releasePage();
    expect(context.route("/en/contacts")).toBe("/en/contacts");
  });

  it("falls back to the mounted page owner when a temporary owner for the same page becomes invalid", async () => {
    const context = new AgentViewContext();
    const pagePrepare = vi.fn(() => Promise.resolve());
    const temporaryPrepare = vi.fn(() => Promise.resolve());
    context.register("/en/contacts", () => ({ surfaceKey: SURFACE.contacts, viewKey: VIEW_ID }), pagePrepare);
    context.register("/en/contacts", () => null, temporaryPrepare);

    const route = context.route("/en/contacts");
    expect(route).toContain(`view=${VIEW_ID}`);
    await context.prepare(route);
    expect(pagePrepare).toHaveBeenCalledOnce();
    expect(temporaryPrepare).not.toHaveBeenCalled();
  });

  it("does not fall back to a stale page under a newer owner, or revive an owner already removed", () => {
    const context = new AgentViewContext();
    const releaseOld = context.register("/en/contacts", () => ({ surfaceKey: SURFACE.contacts, viewKey: VIEW_ID }));
    const releaseNew = context.register("/en/deals", () => ({ surfaceKey: SURFACE.deals, viewKey: ALL_VIEW_KEY }));
    expect(context.route("/en/contacts")).toBe("/en/contacts");
    releaseOld();
    releaseOld();
    expect(context.route("/en/deals")).toContain("viewSurface=deals-card-store");
    releaseNew();
    expect(context.route("/en/contacts")).toBe("/en/contacts");
    expect(context.route("/en/deals")).toBe("/en/deals");
  });

  it("omits invalid or uninitialized context", () => {
    const context = new AgentViewContext();
    context.register("/en/contacts", () => null);
    expect(context.route("/en/contacts")).toBe("/en/contacts");
    context.register("/en/contacts", () => ({ surfaceKey: SURFACE.contacts, viewKey: "invalid" }));
    expect(context.route("/en/contacts")).toBe("/en/contacts");
    context.register("/en/contacts", () => ({ surfaceKey: "invalid", viewKey: VIEW_ID }));
    expect(context.route("/en/contacts")).toBe("/en/contacts");
  });

  it("reloads the server-selected view without stale query overrides, preserving foreign params", () => {
    const context = new AgentViewContext();
    context.register("/en/contacts", () => ({ surfaceKey: SURFACE.contacts, viewKey: VIEW_ID }));
    const href = `http://localhost:4016/en/contacts?view=${VIEW_ID}&searchTerm=old&filters=status:eq:old&sort=name:asc&groupBy=old&page=2&pageSize=5&viewMode=board&contact=selected#details`;
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.contacts, action: "create" }])).toBe(
      "/en/contacts?contact=selected#details",
    );
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.contacts, action: "update", viewKey: VIEW_ID }])).toBe(
      `/en/contacts?contact=selected&view=${VIEW_ID}#details`,
    );
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.contacts, action: "delete", viewKey: VIEW_ID }])).toBe(
      "/en/contacts?contact=selected#details",
    );
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.contacts, action: "delete", viewKey: "other" }])).toBeNull();
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.contacts, action: "update", viewKey: "other" }])).toBeNull();
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.deals, action: "create" }])).toBeNull();
    expect(
      context.reloadHref("http://localhost:4016/en/deals?searchTerm=keep", [
        { surfaceKey: SURFACE.contacts, action: "create" },
      ]),
    ).toBeNull();
  });

  it("reloads an embedded view without rewriting its parent page query", () => {
    const context = new AgentViewContext();
    context.register("/en/contacts", () => ({ surfaceKey: SURFACE.entityTimeline, viewKey: VIEW_ID }));
    const parentHref = `http://localhost:4016/en/contacts?view=parent-view&searchTerm=keep&filters=keep&page=2#details`;

    for (const change of [
      { surfaceKey: SURFACE.entityTimeline, action: "create" as const },
      { surfaceKey: SURFACE.entityTimeline, action: "select" as const },
      { surfaceKey: SURFACE.entityTimeline, action: "update" as const, viewKey: VIEW_ID },
      { surfaceKey: SURFACE.entityTimeline, action: "delete" as const, viewKey: VIEW_ID },
    ])
      expect(context.reloadHref(parentHref, [change])).toBeNull();
  });

  it("reloads a record timeline while keeping the record and applying the server-selected view", () => {
    const context = new AgentViewContext();
    const pathname = `/en/contacts/${RECORD_ID}`;
    context.register(pathname, () => ({ surfaceKey: SURFACE.entityTimeline, viewKey: VIEW_ID }));
    const href = `http://localhost:4016${pathname}?view=${VIEW_ID}&viewSurface=entity-timeline&filters=timelineKind:in:audit&page=2&tab=profile#activity`;

    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.entityTimeline, action: "create" }])).toBe(
      `${pathname}?tab=profile#activity`,
    );
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.entityTimeline, action: "select" }])).toBe(
      `${pathname}?tab=profile#activity`,
    );
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.entityTimeline, action: "update", viewKey: VIEW_ID }])).toBe(
      `${pathname}?tab=profile&view=${VIEW_ID}&viewSurface=entity-timeline#activity`,
    );
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.entityTimeline, action: "delete", viewKey: VIEW_ID }])).toBe(
      `${pathname}?tab=profile#activity`,
    );
  });
});
