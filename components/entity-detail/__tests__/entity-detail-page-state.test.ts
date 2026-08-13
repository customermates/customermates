import { describe, expect, it } from "vitest";

import { resolveEntityDetailPageState, resolveEntityDrawerPageState } from "../entity-detail-page-state";

describe("resolveEntityDetailPageState", () => {
  it.each([
    [false, false, "idle", "loading"],
    [false, true, "loading", "loading"],
    [false, true, "ready", "loading"],
    [false, true, "not-found", "not-found"],
    [false, true, "error", "error"],
    [false, false, "not-found", "loading"],
    [false, false, "error", "loading"],
    [true, true, "idle", "content"],
    [true, true, "loading", "content"],
    [true, true, "ready", "content"],
    [true, true, "not-found", "content"],
    [true, true, "error", "content"],
  ] as const)(
    "maps current=%s, matching=%s, and state=%s to %s",
    (hasCurrentEntity, requestMatches, requestState, expected) => {
      expect(resolveEntityDetailPageState({ hasCurrentEntity, requestMatches, requestState })).toBe(expected);
    },
  );
});

describe("resolveEntityDrawerPageState", () => {
  it.each([
    [false, false, false, "idle", "closed"],
    [true, false, false, "error", "loading"],
    [true, false, false, "not-found", "loading"],
    [true, true, false, "loading", "loading"],
    [true, true, false, "not-found", "not-found"],
    [true, true, false, "error", "error"],
    [true, true, false, "ready", "content"],
    [true, true, true, "idle", "content"],
    [true, true, true, "error", "error"],
  ] as const)(
    "maps active=%s, prepared=%s, new=%s, and state=%s to %s",
    (hasActiveEntity, isPrepared, isNew, requestState, expected) => {
      expect(resolveEntityDrawerPageState({ hasActiveEntity, isNew, isPrepared, requestState })).toBe(expected);
    },
  );
});
