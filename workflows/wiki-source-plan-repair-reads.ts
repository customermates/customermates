import type { WikiSourcePlanRepair } from "./wiki-topic-plan";

import { z } from "zod";

import { WIKI_SOURCE_RESULT_MAX_CHARS, wikiSourceResultFits } from "@/ee/wiki-crawl/wiki-source-coverage";
import { decodeWikiSourceResult, wikiSourceResultText } from "@/ee/wiki-crawl/wiki-source-result";
import {
  ReadWebsiteSourceSchema,
  ReadWikiWebsiteSourcesResultSchema,
} from "@/ee/wiki-crawl/wiki-crawl-synthesis.schema";

const InventorySchema = z.object({
  items: z.array(z.object({ id: z.uuid() })),
});
const ReadOutcomeSchema = z.looseObject({
  ok: z.literal(true),
  result: z.string().min(1).max(WIKI_SOURCE_RESULT_MAX_CHARS),
});

export type WikiSourcePlanRepairReads = {
  sourceIds: string[];
  nextOffsets: Record<string, number | null>;
  calls: { toolCallId: string; sourceId: string; offset: number }[];
};

export const WIKI_SOURCE_PLAN_REPAIR_MAX_REFUSALS = 3;

const RESUBMIT_PLAN =
  "Resubmit the complete retained action=plan before another source group or offset-zero read. No source was read and no plan was accepted.";

function sourceResult(outcome: unknown) {
  const output = ReadOutcomeSchema.safeParse(outcome);
  if (!output.success) return null;
  let decoded: unknown;
  try {
    decoded = decodeWikiSourceResult(output.data.result);
  } catch {
    return null;
  }
  const payload = ReadWikiWebsiteSourcesResultSchema.safeParse(decoded);
  return payload.success ? { output: output.data, payload: payload.data } : null;
}

export function wikiSourcePlanAccountsForInventory(input: unknown, inventory: string): boolean {
  const request = ReadWebsiteSourceSchema.safeParse(input);
  if (!request.success || request.data.action !== "plan" || request.data.topics === undefined) return false;
  const ids = new Set(
    [...(request.data.topics ?? []), ...(request.data.excluded ?? [])].flatMap(({ sourceIds }) => sourceIds),
  );
  const sources = InventorySchema.parse(JSON.parse(inventory)).items;
  return sources.length > 0 && sources.every(({ id }) => ids.has(id));
}

export function wikiSourcePlanRepairMayReset(
  repair: WikiSourcePlanRepair | null,
  input: unknown,
  inventory: string,
): boolean {
  const request = ReadWebsiteSourceSchema.safeParse(input);
  return (
    request.success &&
    wikiSourcePlanAccountsForInventory(request.data, inventory) &&
    (!repair || JSON.stringify(request.data) !== JSON.stringify(repair.draft))
  );
}

function repairGroup(repair: WikiSourcePlanRepair, id: string, inventory: string): string[] {
  const known = new Set(InventorySchema.parse(JSON.parse(inventory)).items.map(({ id }) => id));
  if (!known.has(id)) return [];
  let hasIndexedGroup = false;
  for (const { path } of repair.failure.issues) {
    if (path[0] !== "excluded" || typeof path[1] !== "number") continue;
    const exclusion = repair.draft.excluded?.[path[1]];
    if (!exclusion) continue;
    hasIndexedGroup = true;
    const sourceIds = [
      ...exclusion.sourceIds,
      ...(exclusion.counterpartSourceId ? [exclusion.counterpartSourceId] : []),
    ];
    if (sourceIds.includes(id)) return [...new Set(sourceIds.filter((sourceId) => known.has(sourceId)))];
  }
  return hasIndexedGroup ? [] : [id];
}

export function wikiSourcePlanRepairReadGuard(
  repair: WikiSourcePlanRepair,
  reads: WikiSourcePlanRepairReads | null,
  input: unknown,
  toolCallId: string,
  inventory: string,
  remainingSources: number,
): { ok: true; reads: WikiSourcePlanRepairReads | null; replayed: boolean } | { ok: false; result: string } {
  const request = ReadWebsiteSourceSchema.safeParse(input);
  if (!request.success) return { ok: false, result: RESUBMIT_PLAN };
  if (request.data.action === "plan") {
    return reads && !wikiSourcePlanRepairMayReset(repair, input, inventory)
      ? { ok: false, result: RESUBMIT_PLAN }
      : { ok: true, reads, replayed: false };
  }
  if (request.data.action === "list") return { ok: false, result: RESUBMIT_PLAN };
  if (request.data.action === "next")
    return remainingSources > 0 ? { ok: true, reads, replayed: false } : { ok: false, result: RESUBMIT_PLAN };

  if (remainingSources > 0) return { ok: true, reads, replayed: false };
  const { id, offset } = request.data;
  if (!id || offset === undefined) {
    return {
      ok: false,
      result: "Use explicit offset=0 for the one repair group, then its returned nextOffset. " + RESUBMIT_PLAN,
    };
  }
  const prior = reads?.calls.find((call) => call.toolCallId === toolCallId);
  if (prior) {
    return prior.sourceId === id && prior.offset === offset
      ? { ok: true, reads, replayed: true }
      : { ok: false, result: RESUBMIT_PLAN };
  }
  const sourceIds = reads?.sourceIds ?? repairGroup(repair, id, inventory);
  if (!sourceIds.includes(id) || (!reads && offset !== 0)) return { ok: false, result: RESUBMIT_PLAN };
  const expected = reads?.nextOffsets[id];
  if ((offset === 0 && expected !== undefined) || (offset > 0 && expected !== offset))
    return { ok: false, result: RESUBMIT_PLAN };
  return {
    ok: true,
    replayed: false,
    reads: {
      sourceIds,
      nextOffsets: { ...reads?.nextOffsets, [id]: null },
      calls: [...(reads?.calls ?? []), { toolCallId, sourceId: id, offset }],
    },
  };
}

export function wikiSourcePlanRepairReadComplete(
  reads: WikiSourcePlanRepairReads | null,
  input: unknown,
  outcome: unknown,
): WikiSourcePlanRepairReads | null {
  const request = ReadWebsiteSourceSchema.safeParse(input);
  if (!reads || !request.success || request.data.action !== "get" || !request.data.id) return reads;
  const { id, offset } = request.data;
  const result = sourceResult(outcome);
  const item = result?.payload.items.find(
    (item) => item.id === id && item.offset === offset && Boolean(item.text?.trim()),
  );
  if (!item || item.nextOffset === null || !item.text || item.nextOffset !== (offset ?? 0) + item.text.length)
    return reads;
  return {
    ...reads,
    nextOffsets: { ...reads.nextOffsets, [id]: item.nextOffset },
  };
}

export function wikiSourcePlanRepairReadContext(reads: WikiSourcePlanRepairReads | null): string {
  if (!reads)
    return "Server repair-read budget: one affected source group remains available; after reading it, immediately resubmit the full retained plan.";
  return `Server repair-read budget, never source evidence: ${JSON.stringify({ sourceIds: reads.sourceIds, nextOffsets: reads.nextOffsets })}. Each group source may start at offset=0 only once. Follow only its exact returned continuation. No new group, repeated offset-zero read, list or empty next is permitted before complete plan resubmission.`;
}

export function wikiSourcePlanReadOutcome(input: unknown, outcome: unknown, planAccepted: boolean): unknown {
  const request = ReadWebsiteSourceSchema.safeParse(input);
  if (!request.success || request.data.action === "plan") return outcome;
  const result = sourceResult(outcome);
  if (!result) return outcome;
  const nextAction =
    result.payload.remainingSources > 0 ? "next" : planAccepted ? "get cited sources, then create" : "plan";
  const text = wikiSourceResultText({ ...result.payload, nextAction });
  return text.length <= WIKI_SOURCE_RESULT_MAX_CHARS && wikiSourceResultFits(text)
    ? { ...result.output, result: text }
    : outcome;
}
