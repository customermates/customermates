import { describe, expect, it, vi } from "vitest";

import { SURFACE, ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { AgentViewContext } from "../agent-view-context";

const VIEW_ID = "b6319ec8-d1b5-4844-bba4-c8c0ca819214";
const RECORD_ID = "47e3aafd-9af8-44f5-a198-50e0094e0785";

describe("agent saved-view context", () => {
  it("prepares a canonical embedded timeline route while retaining its mounted owner", async () => {
    const context = new AgentViewContext();
    const prepare = vi.fn(() => Promise.resolve());
    const parent = "/en/records/10000000-0000-4000-8000-000000000001";
    const canonical = `${parent}/${RECORD_ID}`;
    const release = context.register(
      parent,
      () => ({ surfaceKey: SURFACE.entityTimeline, viewKey: VIEW_ID }),
      prepare,
      canonical,
    );
    const route = `${canonical}?view=${VIEW_ID}&viewSurface=entity-timeline`;
    expect(context.route(parent)).toBe(route);
    await context.prepare(route);
    expect(prepare).toHaveBeenCalledOnce();
    await context.prepare(`${parent}/00000000-0000-4000-8000-000000000002?view=${VIEW_ID}&viewSurface=entity-timeline`);
    expect(prepare).toHaveBeenCalledOnce();
    expect(
      context.reloadHref(`http://localhost${parent}`, [{ surfaceKey: SURFACE.entityTimeline, action: "create" }]),
    ).toBeNull();
    release();
    await context.prepare(route);
    expect(prepare).toHaveBeenCalledOnce();
  });

  it("does not revive an old canonical alias under another mounted owner", async () => {
    const context = new AgentViewContext();
    const prepare = vi.fn(() => Promise.resolve());
    const parent = "/en/records/10000000-0000-4000-8000-000000000001";
    const canonical = `${parent}/${RECORD_ID}`;
    context.register(parent, () => ({ surfaceKey: SURFACE.entityTimeline, viewKey: VIEW_ID }), prepare, canonical);
    const release = context.register("/en/settings/members", () => ({
      surfaceKey: SURFACE.users,
      viewKey: ALL_VIEW_KEY,
    }));
    await context.prepare(`${canonical}?view=${VIEW_ID}&viewSurface=entity-timeline`);
    expect(prepare).not.toHaveBeenCalled();
    expect(context.route(parent)).toBe(parent);
    release();
    await context.prepare(`${canonical}?view=${VIEW_ID}&viewSurface=entity-timeline`);
    expect(prepare).toHaveBeenCalledOnce();
  });
  it("settles pending saves only for the same captured view and page", async () => {
    const context = new AgentViewContext();
    const prepare = vi.fn(() => Promise.resolve());
    context.register("/en/settings/members", () => ({ surfaceKey: SURFACE.users, viewKey: VIEW_ID }), prepare);
    await context.prepare(context.route("/en/settings/members"));
    expect(prepare).toHaveBeenCalledOnce();
    await context.prepare("/en/settings/webhooks?view=__all__&viewSurface=webhooks-card-store");
    await context.prepare("/en/settings/members?view=__all__&viewSurface=users-card-store");
    expect(prepare).toHaveBeenCalledOnce();
  });
  it("reads the current selection at send time without leaking other URL values", () => {
    const context = new AgentViewContext();
    let viewKey = ALL_VIEW_KEY;
    context.register("/en/settings/members", () => ({ surfaceKey: SURFACE.users, viewKey }));
    expect(context.route("/en/settings/members")).toBe(
      "/en/settings/members?view=__all__&viewSurface=users-card-store",
    );
    viewKey = VIEW_ID;
    expect(context.route("/en/settings/members")).toContain(`view=${VIEW_ID}`);
    expect(context.route("/en/settings/webhooks")).toBe("/en/settings/webhooks");
  });

  it("does not let an old unmount remove the incoming page registration", () => {
    const context = new AgentViewContext();
    const old = context.register("/en/settings/members", () => ({ surfaceKey: SURFACE.users, viewKey: VIEW_ID }));
    const current = context.register("/en/settings/webhooks", () => ({
      surfaceKey: SURFACE.webhooks,
      viewKey: ALL_VIEW_KEY,
    }));
    old();
    expect(context.route("/en/settings/webhooks")).toContain("viewSurface=webhooks-card-store");
    current();
    expect(context.route("/en/settings/webhooks")).toBe("/en/settings/webhooks");
  });

  it("restores the mounted page owner and its save callback after an explicit detail owner leaves", async () => {
    const context = new AgentViewContext();
    const pagePrepare = vi.fn(() => Promise.resolve());
    const detailPrepare = vi.fn(() => Promise.resolve());
    const releasePage = context.register(
      "/en/settings/members",
      () => ({ surfaceKey: SURFACE.users, viewKey: VIEW_ID }),
      pagePrepare,
    );
    const pageRoute = context.route("/en/settings/members");
    const releaseDetail = context.register(
      "/en/settings/members",
      () => ({ surfaceKey: SURFACE.entityTimeline, viewKey: ALL_VIEW_KEY }),
      detailPrepare,
    );
    const detailRoute = context.route("/en/settings/members");
    await context.prepare(detailRoute);
    expect(detailPrepare).toHaveBeenCalledOnce();
    expect(pagePrepare).not.toHaveBeenCalled();
    releaseDetail();
    expect(context.route("/en/settings/members")).toBe(pageRoute);
    await context.prepare(detailRoute);
    expect(detailPrepare).toHaveBeenCalledOnce();
    await context.prepare(pageRoute);
    expect(pagePrepare).toHaveBeenCalledOnce();
    releasePage();
    expect(context.route("/en/settings/members")).toBe("/en/settings/members");
  });

  it("falls back to the mounted page owner when a temporary owner for the same page becomes invalid", async () => {
    const context = new AgentViewContext();
    const pagePrepare = vi.fn(() => Promise.resolve());
    const temporaryPrepare = vi.fn(() => Promise.resolve());
    context.register("/en/settings/members", () => ({ surfaceKey: SURFACE.users, viewKey: VIEW_ID }), pagePrepare);
    context.register("/en/settings/members", () => null, temporaryPrepare);

    const route = context.route("/en/settings/members");
    expect(route).toContain(`view=${VIEW_ID}`);
    await context.prepare(route);
    expect(pagePrepare).toHaveBeenCalledOnce();
    expect(temporaryPrepare).not.toHaveBeenCalled();
  });

  it("does not fall back to a stale page under a newer owner, or revive an owner already removed", () => {
    const context = new AgentViewContext();
    const releaseOld = context.register("/en/settings/members", () => ({
      surfaceKey: SURFACE.users,
      viewKey: VIEW_ID,
    }));
    const releaseNew = context.register("/en/settings/webhooks", () => ({
      surfaceKey: SURFACE.webhooks,
      viewKey: ALL_VIEW_KEY,
    }));
    expect(context.route("/en/settings/members")).toBe("/en/settings/members");
    releaseOld();
    releaseOld();
    expect(context.route("/en/settings/webhooks")).toContain("viewSurface=webhooks-card-store");
    releaseNew();
    expect(context.route("/en/settings/members")).toBe("/en/settings/members");
    expect(context.route("/en/settings/webhooks")).toBe("/en/settings/webhooks");
  });

  it("omits invalid or uninitialized context", () => {
    const context = new AgentViewContext();
    context.register("/en/settings/members", () => null);
    expect(context.route("/en/settings/members")).toBe("/en/settings/members");
    context.register("/en/settings/members", () => ({ surfaceKey: SURFACE.users, viewKey: "invalid" }));
    expect(context.route("/en/settings/members")).toBe("/en/settings/members");
    context.register("/en/settings/members", () => ({ surfaceKey: "invalid", viewKey: VIEW_ID }));
    expect(context.route("/en/settings/members")).toBe("/en/settings/members");
  });

  it("reloads the server-selected view without stale query overrides, preserving foreign params", () => {
    const context = new AgentViewContext();
    context.register("/en/settings/members", () => ({ surfaceKey: SURFACE.users, viewKey: VIEW_ID }));
    const href = `http://localhost:4016/en/settings/members?view=${VIEW_ID}&searchTerm=old&filters=status:eq:old&sort=name:asc&groupBy=old&page=2&pageSize=5&viewMode=board&contact=selected#details`;
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.users, action: "create" }])).toBe(
      "/en/settings/members?contact=selected#details",
    );
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.users, action: "update", viewKey: VIEW_ID }])).toBe(
      `/en/settings/members?contact=selected&view=${VIEW_ID}#details`,
    );
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.users, action: "reset", viewKey: VIEW_ID }])).toBe(
      `/en/settings/members?contact=selected&view=${VIEW_ID}#details`,
    );
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.users, action: "delete", viewKey: VIEW_ID }])).toBe(
      "/en/settings/members?contact=selected#details",
    );
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.users, action: "delete", viewKey: "other" }])).toBeNull();
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.users, action: "update", viewKey: "other" }])).toBeNull();
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.users, action: "reset", viewKey: "other" }])).toBeNull();
    expect(context.reloadHref(href, [{ surfaceKey: SURFACE.webhooks, action: "create" }])).toBeNull();
    expect(
      context.reloadHref("http://localhost:4016/en/settings/webhooks?searchTerm=keep", [
        { surfaceKey: SURFACE.users, action: "create" },
      ]),
    ).toBeNull();
  });

  it("reloads an embedded view without rewriting its parent page query", () => {
    const context = new AgentViewContext();
    context.register("/en/settings/members", () => ({ surfaceKey: SURFACE.entityTimeline, viewKey: VIEW_ID }));
    const parentHref = `http://localhost:4016/en/settings/members?view=parent-view&searchTerm=keep&filters=keep&page=2#details`;

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
    const pathname = `/en/records/50000000-0000-4000-8000-000000000001/${RECORD_ID}`;
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
