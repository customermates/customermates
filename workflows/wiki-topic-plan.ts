import type { ReadWebsiteSourceInput, WikiSourceTopic } from "@/ee/wiki-crawl/wiki-crawl-synthesis.schema";

import { z } from "zod";

import { CustomErrorCode } from "@/core/validation/validation.types";

import { ReadWebsiteSourceSchema } from "@/ee/wiki-crawl/wiki-crawl-synthesis.schema";

const SourceInventorySchema = z.object({
  items: z.array(z.object({ id: z.uuid(), imported: z.boolean().optional() })),
});
const PlanningFailureSchema = z.object({
  ok: z.literal(false),
  failure: z.object({ issues: z.array(z.object({ customCode: z.string().optional() })) }),
});

export function wikiPlanningCandidates(input: unknown, outcome: unknown, inventory: string): WikiSourceTopic[] {
  const plan = ReadWebsiteSourceSchema.safeParse(input);
  const failure = PlanningFailureSchema.safeParse(outcome);
  if (
    !plan.success ||
    plan.data.action !== "plan" ||
    !failure.success ||
    !failure.data.failure.issues.some(
      ({ customCode }) =>
        customCode === CustomErrorCode.wikiSourceCoverageRequired ||
        customCode === CustomErrorCode.wikiSourcePlanIncomplete,
    )
  )
    return [];
  const titles = (plan.data.topics ?? []).map(({ title }) => title.toLowerCase());
  if (new Set(titles).size !== titles.length) return [];
  const sources = new Map(
    SourceInventorySchema.parse(JSON.parse(inventory)).items.map(({ id, imported }) => [id, imported]),
  );
  return (plan.data.topics ?? []).filter(
    ({ role, sourceIds: ids }) =>
      role === "offering" &&
      ids.every((id) => sources.has(id)) &&
      ids.some((id) => sources.get(id) !== true) &&
      new Set(ids).size === ids.length,
  );
}

function matchingOfferings(
  known: readonly WikiSourceTopic[],
  candidates: readonly WikiSourceTopic[],
): Map<number, number> {
  const matched = new Map<number, number>();
  const visit = (index: number, seen: Set<number>): boolean => {
    const offering = known[index];
    const targets = candidates
      .map((topic, targetIndex) => ({ topic, targetIndex }))
      .sort((a, b) => Number(b.topic.title === offering.title) - Number(a.topic.title === offering.title));
    for (const { topic, targetIndex } of targets) {
      if (seen.has(targetIndex) || !offering.sourceIds.every((id) => topic.sourceIds.includes(id))) continue;
      seen.add(targetIndex);
      const prior = matched.get(targetIndex);
      if (prior === undefined || visit(prior, seen)) {
        matched.set(targetIndex, index);
        return true;
      }
    }
    return false;
  };
  known.forEach((_, index) => visit(index, new Set()));
  return matched;
}

export function wikiMergeOfferingCandidates(
  known: readonly WikiSourceTopic[],
  incoming: readonly WikiSourceTopic[],
): WikiSourceTopic[] {
  const matched = matchingOfferings(known, incoming);
  return [...known, ...incoming.filter((_, index) => !matched.has(index))];
}

export function wikiMissingOfferingCandidates(
  known: readonly WikiSourceTopic[],
  plan: ReadWebsiteSourceInput,
): WikiSourceTopic[] {
  const unresolved = known.filter(
    (offering) =>
      !offering.sourceIds.every((sourceId) =>
        (plan.reclassifiedOfferings ?? []).some(
          (value) => value.title === offering.title && value.sourceId === sourceId,
        ),
      ),
  );
  const matched = new Set(
    matchingOfferings(
      unresolved,
      (plan.topics ?? []).filter(({ role }) => role === "offering"),
    ).values(),
  );
  return unresolved.filter((_, index) => !matched.has(index));
}

export function wikiPlanningContext(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
}
