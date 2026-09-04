import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  ALL_VIEW_KEY,
  DATA_VIEW_SURFACES,
  DATA_VIEW_SURFACE_KEYS,
  SURFACE,
  isLinkableSurface,
  isShareableSurface,
} from "../data-view-keys";

describe("data view keys", () => {
  it("keeps the All key outside the uuid space so it can never collide with a view id", () => {
    expect(z.uuid().safeParse(ALL_VIEW_KEY).success).toBe(false);
    expect(ALL_VIEW_KEY).toBe("__all__");
  });

  it("declares one descriptor per surface key with no duplicates", () => {
    expect(new Set(DATA_VIEW_SURFACE_KEYS).size).toBe(DATA_VIEW_SURFACE_KEYS.length);
    expect(Object.keys(DATA_VIEW_SURFACES).sort()).toEqual([...DATA_VIEW_SURFACE_KEYS].sort());
    expect(new Set(Object.values(SURFACE)).size).toBe(Object.values(SURFACE).length);
    expect([...DATA_VIEW_SURFACE_KEYS].sort()).toEqual([...Object.values(SURFACE)].sort());
  });

  it("marks every operator surface as not shareable", () => {
    for (const key of [SURFACE.operatorUsers, SURFACE.operatorWorkspaces, SURFACE.operatorAudit]) {
      expect(DATA_VIEW_SURFACES[key].shareable).toBe(false);
      expect(isShareableSurface(key)).toBe(false);
      expect(isLinkableSurface(key)).toBe(true);
    }
  });

  it("marks the entity timeline as embedded and not linkable", () => {
    expect(DATA_VIEW_SURFACES[SURFACE.entityTimeline]).toMatchObject({ kind: "embedded", linkable: false });
    expect(isLinkableSurface(SURFACE.entityTimeline)).toBe(false);
    expect(isShareableSurface(SURFACE.entityTimeline)).toBe(true);
  });

  it("treats an unknown key as neither shareable nor linkable", () => {
    expect(isShareableSurface("contact-detail")).toBe(false);
    expect(isLinkableSurface(undefined)).toBe(false);
  });
});
