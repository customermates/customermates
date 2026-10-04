import { describe, expect, it } from "vitest";

import { SHIPPED_AGENT_MODEL, SHIPPED_AGENT_MODEL_KEY } from "@/ee/agent-chat/model-catalog";

import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";

import { armById } from "../arms";
import { worstCaseEpisodeUsd } from "../campaign";
import { benchmarkCaseModelSelection, MERGE_CHECK_DEFAULT_CAP_USD, mergeCheckMinimumCapUsd } from "../episode";
import { BENCHMARK_CASES } from "../fixtures";

describe("unified benchmark registry", () => {
  it("contains the complete 72-case, 79-turn suite plus 130 held-out cases without duplicate ids", () => {
    const suite = BENCHMARK_CASES.filter((definition) => definition.heldout !== true);
    const heldout = BENCHMARK_CASES.filter((definition) => definition.heldout === true);
    expect(suite).toHaveLength(72);
    expect(suite.reduce((total, definition) => total + definition.prompts.length, 0)).toBe(79);
    expect(heldout).toHaveLength(130);
    expect(heldout.reduce((total, definition) => total + definition.prompts.length, 0)).toBe(150);
    expect(new Set(BENCHMARK_CASES.map((definition) => definition.id)).size).toBe(BENCHMARK_CASES.length);
  });

  it("keeps every migrated release regression strict", () => {
    const required = BENCHMARK_CASES.filter((definition) => definition.mergeRequired);
    expect(required.map((definition) => definition.id)).toEqual([
      "M8",
      "V37",
      "V38",
      "V39",
      "V40",
      "V41",
      "V42",
      "R43",
      "U44",
      "U45",
      "U46",
      "R47",
      "R48",
      "R49",
      "R50",
      "R51",
      "R52",
      "R53",
    ]);
    expect(required.reduce((total, definition) => total + definition.prompts.length, 0)).toBe(20);
  });

  it("covers view context and preserves the explicit fast-model pin contract", () => {
    const byId = new Map(BENCHMARK_CASES.map((definition) => [definition.id, definition]));
    expect(byId.get("V37")?.contexts?.[0]).toEqual({
      pageRoute: `/en/records/{contactType}?view=${ALL_VIEW_KEY}&viewSurface=records:{contactType}&viewAction=update`,
      contexts: [
        {
          label: "Contact view: All",
          reference: {
            kind: "dataView",
            surfaceKey: "records:{contactType}",
            viewKey: ALL_VIEW_KEY,
            requestedAction: "update",
          },
        },
      ],
    });
    expect(byId.get("V39")?.contexts?.[0]?.pageRoute).toContain("?view={view}&");
    expect(byId.get("V40")?.contexts?.[0]).toMatchObject({
      pageRoute: expect.stringContaining("viewAction=create"),
      contexts: [
        {
          label: "New Contact view: Contacts with deals",
          reference: {
            kind: "dataView",
            surfaceKey: "records:{contactType}",
            proposedName: "Contacts with deals",
            requestedAction: "create",
          },
        },
      ],
    });
    expect(byId.get("V41")?.contexts?.[0]).toEqual({
      locale: "de",
      pageRoute: `/de/records/{contactType}/{contact}?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.entityTimeline}&viewAction=update`,
      contexts: [
        {
          label: "Aktivitätsansicht: Alle",
          reference: {
            kind: "dataView",
            surfaceKey: SURFACE.entityTimeline,
            viewKey: ALL_VIEW_KEY,
            requestedAction: "update",
          },
        },
        {
          label: "Ada Lovelace",
          reference: {
            kind: "record",
            typeId: "{contactType}",
            recordId: "{contact}",
          },
        },
      ],
    });
    expect(byId.get("V40")?.prompts[0]).toContain("set the search text to View");
    expect(byId.get("V40")?.prompts[0]).toContain("group them by creation month");
    expect(byId.get("R49")?.contexts).toEqual([{ modelKey: "bench:flash-low" }, { modelKey: "omit" }]);
    const shippedModel = SHIPPED_AGENT_MODEL;
    for (const arm of ["shipped", "flash-lite-medium"]) {
      const pinned = benchmarkCaseModelSelection("R49", armById(arm));
      expect(pinned).toEqual({
        modelKey: "bench:flash-low",
        modelConfig: {
          modelId: "google/gemini-3.5-flash",
          servingProvider: "vertex",
          inferenceRegion: "eu",
          maxOutputTokens: 8192,
          maxContextTokens: 66_000,
          maxToolResultChars: 6000,
          thinkingLevel: "low",
        },
      });
      expect(pinned.modelConfig.modelId).not.toBe(shippedModel.modelId);
      expect(pinned.modelConfig.servingProvider).toBe(shippedModel.servingProvider);
      expect(pinned.modelConfig.inferenceRegion).toBe(shippedModel.inferenceRegion);
    }
    expect(benchmarkCaseModelSelection("S1", armById("flash-lite-medium"))).toMatchObject({
      modelKey: "bench:flash-lite-medium",
      modelConfig: {
        modelId: "google/gemini-3.5-flash-lite",
        thinkingLevel: "medium",
      },
    });
  });

  it("sizes the merge check's default cap above the largest single-episode reservation, which R49's pinned model sets", () => {
    const suite = BENCHMARK_CASES.filter((definition) => definition.heldout !== true);
    const shipped = armById("shipped");
    const minimum = mergeCheckMinimumCapUsd(
      suite.map((definition) => definition.id),
      shipped,
    );
    const r49 = suite.find((definition) => definition.id === "R49");
    if (!r49) throw new Error("expected R49 in the merge suite");

    expect(minimum.caseId).toBe("R49");
    expect(minimum.capUsd).toBeCloseTo(
      worstCaseEpisodeUsd({ ...shipped, ...benchmarkCaseModelSelection("R49", shipped).modelConfig }, r49.prompts.length),
      9,
    );
    expect(minimum.capUsd).toBeGreaterThan(10);
    expect(minimum.capUsd).toBeLessThanOrEqual(MERGE_CHECK_DEFAULT_CAP_USD);
    expect(MERGE_CHECK_DEFAULT_CAP_USD).toBe(20);
    expect(() => mergeCheckMinimumCapUsd([], shipped)).toThrow("A merge check needs at least one case.");
  });
});
