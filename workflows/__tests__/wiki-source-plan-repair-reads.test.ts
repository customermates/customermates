import type { WikiSourcePlanRepair } from "@/workflows/wiki-topic-plan";
import type { WikiSourcePlanRepairReads } from "@/workflows/wiki-source-plan-repair-reads";

import { describe, expect, it } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { ReadWebsiteSourceSchema } from "@/ee/wiki-crawl/wiki-crawl-synthesis.schema";
import { WIKI_SOURCE_RESULT_MAX_CHARS, wikiSourceResultFits } from "@/ee/wiki-crawl/wiki-source-coverage";
import { decodeWikiSourceResult, wikiSourceResultText } from "@/ee/wiki-crawl/wiki-source-result";
import { wikiReadSourceEvidence } from "@/workflows/wiki-source-evidence";
import {
  wikiSourcePlanAccountsForInventory,
  wikiSourcePlanRepairMayReset,
  wikiSourcePlanRepairReadComplete,
  wikiSourcePlanRepairReadContext,
  wikiSourcePlanRepairReadGuard,
  wikiSourcePlanReadOutcome,
} from "@/workflows/wiki-source-plan-repair-reads";

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const inventory = JSON.stringify({
  items: [1, 2, 3].map((index) => ({ id: id(index) })),
});
const draft = ReadWebsiteSourceSchema.parse({
  action: "plan",
  topics: [{ title: "Service", role: "offering", sourceIds: [id(1)] }],
  excluded: [
    {
      sourceIds: [id(2)],
      basis: "overlap",
      reason: "Redundant case",
      coveredByTitle: "Service",
      coveredByRole: "offering",
      evidenceQuote: "Wrong excluded quote",
      counterpartSourceId: id(1),
      counterpartQuote: "Wrong counterpart quote",
    },
    {
      sourceIds: [id(3)],
      basis: "not_substantive",
      reason: "Archive",
      evidenceQuote: "Wrong archive quote",
    },
  ],
});
const repair: WikiSourcePlanRepair = {
  draft,
  failure: {
    kind: "validation",
    issues: [
      {
        code: "custom",
        path: ["excluded", 0, "evidenceQuote"],
        message: "Copy the actual sentence.",
        customCode: CustomErrorCode.wikiSourceExclusionEvidenceInvalid,
      },
    ],
  },
  repairInstructions: "Repair excluded[0].evidenceQuote and resubmit the complete draft.",
};
const request = (index = 2, offset = 0) => ({
  action: "get",
  id: id(index),
  offset,
});
const guard = (reads: WikiSourcePlanRepairReads | null, input: unknown, call = "read", remaining = 0) =>
  wikiSourcePlanRepairReadGuard(repair, reads, input, call, inventory, remaining);
const claim = (reads: WikiSourcePlanRepairReads | null = null, input = request(), call = "read") => {
  const admitted = guard(reads, input, call);
  expect(admitted.ok).toBe(true);
  if (!admitted.ok || !admitted.reads) throw new Error("Expected an admitted repair read.");
  return admitted.reads;
};
const outcome = (
  text = "Exact stored sentence.",
  offset = 0,
  nextOffset: number | null = null,
  index = 2,
  remainingSources = 0,
) => ({
  ok: true,
  result: wikiSourceResultText({
    createdPageLinks: [],
    remainingSources,
    importedSources: 0,
    nextAction: "get cited sources, then create",
    items: [
      {
        id: id(index),
        title: "Stored source",
        url: "https://example.com/archive",
        category: "other",
        offset,
        nextOffset,
        text,
      },
    ],
  }),
});

describe("bounded rejected website-plan repair", () => {
  it("admits an indexed exclusion and its counterpart once, then rejects new groups and repeated starts", () => {
    expect(guard(null, request(3), "unrelated-first").ok).toBe(false);
    const first = claim();
    expect(first.sourceIds).toEqual([id(2), id(1)]);
    const pair = claim(first, request(1), "counterpart");
    expect(pair.calls).toHaveLength(2);
    for (const input of [request(3), request(2), request(1), { action: "get", id: id(2) }, request(4)]) {
      expect(guard(pair, input, "other")).toMatchObject({
        ok: false,
        result: expect.stringContaining("Resubmit the complete"),
      });
    }
  });

  it("follows only the exact returned positive cursor without permitting skips or rewind", () => {
    const text = "First complete source chunk.";
    const first = claim();
    const ready = wikiSourcePlanRepairReadComplete(first, request(), outcome(text, 0, text.length));
    expect(ready?.nextOffsets[id(2)]).toBe(text.length);
    for (const offset of [0, 1, text.length - 1, text.length + 1])
      expect(guard(ready, request(2, offset), `bad-${offset}`).ok).toBe(false);
    const continuation = claim(ready, request(2, text.length), "continuation");
    const finished = wikiSourcePlanRepairReadComplete(
      continuation,
      request(2, text.length),
      outcome("Last chunk.", text.length),
    );
    expect(finished?.nextOffsets[id(2)]).toBeNull();
    expect(guard(finished, request(2, text.length), "repeat-continuation").ok).toBe(false);
  });

  it("consumes failed, empty, wrong-source and malformed cursor reads instead of reopening them", () => {
    for (const output of [
      { ok: false, result: "Storage read failed." },
      { ok: true, result: "malformed: [" },
      outcome(""),
      outcome("A", 0, 10),
      outcome("A", 0, 1, 3),
      outcome("A", 1, 2),
    ]) {
      const first = claim();
      const complete = wikiSourcePlanRepairReadComplete(first, request(), output);
      expect(complete).toEqual(first);
      expect(guard(complete, request(), "new-call").ok).toBe(false);
      expect(guard(complete, request(2, 1), "invented-continuation").ok).toBe(false);
    }
  });

  it("replays an identical durable tool call without consuming twice or accepting a changed input", () => {
    const first = claim();
    const ready = wikiSourcePlanRepairReadComplete(first, request(), outcome("abc", 0, 3));
    expect(guard(ready, request(), "read")).toEqual({
      ok: true,
      reads: ready,
      replayed: true,
    });
    expect(guard(ready, request(1), "read").ok).toBe(false);
    expect(guard(ready, request(2, 3), "read").ok).toBe(false);
    expect(ready?.nextOffsets[id(2)]).toBe(3);
  });

  it("allows real unread coverage without resetting the consumed repair group", () => {
    const first = claim();
    expect(guard(first, { action: "next" }, "coverage", 1)).toEqual({
      ok: true,
      reads: first,
      replayed: false,
    });
    expect(guard(first, request(3), "coverage-get", 1)).toEqual({
      ok: true,
      reads: first,
      replayed: false,
    });
    expect(guard(first, { action: "next" }, "empty-next", 0).ok).toBe(false);
    expect(guard(first, { action: "list", offset: 0 }, "list", 1).ok).toBe(false);
  });

  it("does not reopen a group for identical normalized full plans or empty and partial drafts", () => {
    const first = claim();
    const reordered = {
      excluded: draft.excluded,
      topics: draft.topics,
      action: "plan",
    };
    expect(wikiSourcePlanAccountsForInventory(draft, inventory)).toBe(true);
    expect(wikiSourcePlanRepairMayReset(repair, reordered, inventory)).toBe(false);
    expect(guard(first, reordered, "same-plan").ok).toBe(false);
    for (const input of [
      { action: "plan", topics: [], excluded: [] },
      { ...draft, excluded: [] },
      { action: "plan" },
    ]) {
      expect(wikiSourcePlanAccountsForInventory(input, inventory)).toBe(false);
      expect(wikiSourcePlanRepairMayReset(repair, input, inventory)).toBe(false);
      expect(guard(first, input, "partial-plan").ok).toBe(false);
    }
    expect(wikiSourcePlanAccountsForInventory(draft, JSON.stringify({ items: [] }))).toBe(false);
    const corrected = {
      ...draft,
      excluded: draft.excluded?.map((entry, index) =>
        index === 0 ? { ...entry, evidenceQuote: "Exact stored sentence." } : entry,
      ),
    };
    expect(wikiSourcePlanRepairMayReset(repair, corrected, inventory)).toBe(true);
    expect(guard(first, corrected, "full-plan").ok).toBe(true);
  });

  it("preserves its plain replay state and cursor reminder through JSON serialization", () => {
    const ready = wikiSourcePlanRepairReadComplete(
      claim(null, request(), "private-call-not-in-context"),
      request(),
      outcome("abc", 0, 3),
    );
    const replayed: WikiSourcePlanRepairReads = JSON.parse(JSON.stringify(ready));
    expect(replayed).toEqual(ready);
    expect(guard(replayed, request(2, 3), "next-chunk").ok).toBe(true);
    expect(guard(replayed, request(3), "unrelated").ok).toBe(false);
    const context = wikiSourcePlanRepairReadContext(replayed);
    expect(context).toContain(id(2));
    expect(context).toContain('"nextOffsets"');
    expect(context).toContain("resubmission");
    expect(context).not.toContain("private-call-not-in-context");
  });

  it.each([false, true])(
    "uses only trusted accepted-plan state (%s) without altering exact raw source evidence",
    (accepted) => {
      const original = outcome("Raw quoted text: `literal`\n\nSource punctuation & whitespace.\n");
      const projected = wikiSourcePlanReadOutcome({ ...request(), planAccepted: !accepted }, original, accepted);
      expect(projected).toMatchObject({ ok: true, result: expect.any(String) });
      const encoded = (projected as { result: string }).result;
      const decoded = decodeWikiSourceResult(encoded);
      expect(decoded).toEqual({
        ...(decodeWikiSourceResult(original.result) as object),
        nextAction: accepted ? "get cited sources, then create" : "plan",
      });
      expect(encoded.slice(encoded.indexOf("\n\nStored website source text:\n"))).toBe(
        original.result.slice(original.result.indexOf("\n\nStored website source text:\n")),
      );
      expect(wikiReadSourceEvidence(request(), projected)).toEqual({
        sourceId: id(2),
        result: encoded,
      });
      expect(encoded.length).toBeLessThanOrEqual(WIKI_SOURCE_RESULT_MAX_CHARS);
    },
  );

  it("preserves the native encoded-byte ceiling for a Unicode source frame", () => {
    const payload = {
      createdPageLinks: [],
      remainingSources: 0,
      importedSources: 0,
      nextAction: "plan",
      items: [
        {
          id: id(2),
          title: "Stored source",
          url: "https://example.com/archive",
          category: "other",
          offset: 0,
          nextOffset: null,
          text: "😀".repeat(11_600),
        },
      ],
    };
    let framed = wikiSourceResultText(payload);
    while (
      wikiSourceResultFits(
        wikiSourceResultText({
          ...payload,
          items: [{ ...payload.items[0], text: payload.items[0].text + "x" }],
        }),
      )
    ) {
      payload.items[0].text += "x";
      framed = wikiSourceResultText(payload);
    }
    expect(wikiSourceResultFits(framed)).toBe(true);
    expect(
      wikiSourceResultFits(
        wikiSourceResultText({
          ...payload,
          nextAction: "get cited sources, then create",
        }),
      ),
    ).toBe(false);
    const full = { ok: true, result: framed };
    expect(wikiSourcePlanReadOutcome(request(), full, true)).toBe(full);
    expect(decodeWikiSourceResult(full.result)).toMatchObject({
      items: [{ text: payload.items[0].text }],
    });
  });

  it("keeps pending next and accepted plan outcomes intact, and never expands a full encoded frame past its bound", () => {
    expect(
      decodeWikiSourceResult(
        (wikiSourcePlanReadOutcome(request(), outcome("text", 0, null, 2, 1), false) as { result: string }).result,
      ),
    ).toMatchObject({ nextAction: "next" });
    const acceptedPlan = { ok: true, result: "accepted-plan" };
    expect(wikiSourcePlanReadOutcome(draft, acceptedPlan, true)).toBe(acceptedPlan);
    const metadata = {
      createdPageLinks: [],
      remainingSources: 0,
      importedSources: 0,
      nextAction: "plan",
      items: [
        {
          id: id(2),
          title: "Stored source",
          url: "https://example.com/archive",
          category: "other",
          offset: 0,
          nextOffset: null,
          text: "",
        },
      ],
    };
    const padding = WIKI_SOURCE_RESULT_MAX_CHARS - wikiSourceResultText(metadata).length;
    const full = {
      ok: true,
      result: wikiSourceResultText({
        ...metadata,
        items: [{ ...metadata.items[0], text: "x".repeat(padding - 8) }],
      }),
    };
    expect(full.result.length).toBeLessThanOrEqual(WIKI_SOURCE_RESULT_MAX_CHARS);
    expect(wikiSourcePlanReadOutcome(request(), full, true)).toBe(full);
  });
});
