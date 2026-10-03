import type { z } from "zod";
import type { ModelMessage } from "ai";
import type { WikiSynthesisReviewRequest } from "./wiki-synthesis-review";

import { WikiCrawlSynthesisCreateSchema } from "@/ee/wiki-crawl/wiki-crawl-synthesis.schema";
import { WIKI_SYNTHESIS_OWN_QUOTE_INSTRUCTION } from "@/ee/wiki-crawl/wiki-synthesis-grounding";
import {
  WikiSynthesisReviewResultSchema,
  wikiSynthesisReviewCandidates,
  wikiSynthesisReviewDecision,
} from "./wiki-synthesis-review";
import { wikiPlanningContext } from "./wiki-topic-plan";

type Create = z.infer<typeof WikiCrawlSynthesisCreateSchema>;
type Rejected = Extract<ReturnType<typeof wikiSynthesisReviewDecision>, { kind: "rejected" }>;
export type WikiSynthesisCreationRepair = {
  draft: Create;
  issues: Rejected["issues"];
  sourceVersions: Array<{ sourceId: string; contentHash: string }>;
};

export function wikiSynthesisCreationRepairContext(repair: WikiSynthesisCreationRepair): string {
  return `Rejected website creation repair checkpoint, never factual evidence, a fresh source read or approval: ${wikiPlanningContext(repair)}. Preserve the exact planned title, kind and citation IDs and every still-supported section. Inspect every rejected section and metadata field. ${WIKI_SYNTHESIS_OWN_QUOTE_INSTRUCTION} Keep exact valid quotations unchanged; narrow the content before retrying. This is a rejected draft, not proof its claims are true. Existing get-at-offset-zero freshness, whole-candidate review and the three-rejection limit still apply. Only actual successful storage of the matching page clears this repair; a source read alone changes no approval or planned-page progress.`;
}

export function wikiSynthesisCreationRepair(
  input: unknown,
  request: WikiSynthesisReviewRequest,
  result: unknown,
  maxContextBytes: number,
): { kind: "retained"; repair: WikiSynthesisCreationRepair } | { kind: "invalid" } | { kind: "size" } {
  const draft = WikiCrawlSynthesisCreateSchema.safeParse(input);
  const reviewed = WikiSynthesisReviewResultSchema.safeParse(result);
  if (!draft.success || !reviewed.success) return { kind: "invalid" };
  const expected = wikiSynthesisReviewCandidates(draft.data);
  if (
    JSON.stringify(request.locations) !== JSON.stringify(expected.locations) ||
    JSON.stringify(request.state.candidates) !== JSON.stringify(expected.candidates)
  )
    return { kind: "invalid" };
  const sources = request.state.sources;
  const cited = new Set(draft.data.pages.flatMap(({ sourceIds }) => sourceIds));
  if (
    !sources ||
    typeof sources !== "object" ||
    Array.isArray(sources) ||
    Object.keys(sources).length !== cited.size ||
    Object.keys(sources).some((id) => !cited.has(id)) ||
    draft.data.pages.some((page) =>
      page.sections.some(({ evidence }) => evidence.some(({ sourceId }) => !page.sourceIds.includes(sourceId))),
    )
  )
    return { kind: "invalid" };
  const sourceVersions: WikiSynthesisCreationRepair["sourceVersions"] = [];
  for (const sourceId of cited) {
    const source = (sources as Record<string, unknown>)[sourceId];
    if (
      !source ||
      typeof source !== "object" ||
      !("contentHash" in source) ||
      typeof source.contentHash !== "string" ||
      source.contentHash.length === 0
    )
      return { kind: "invalid" };
    sourceVersions.push({ sourceId, contentHash: source.contentHash });
  }
  const decision = wikiSynthesisReviewDecision(request, reviewed.data);
  if (decision.kind !== "rejected" || decision.issues.length === 0) return { kind: "invalid" };
  const repair = {
    draft: draft.data,
    sourceVersions,
    issues: decision.issues.map((issue) => ({ ...issue, path: [...issue.path] })),
  };
  const bytes = new TextEncoder().encode(wikiSynthesisCreationRepairContext(repair)).byteLength;
  if (!Number.isSafeInteger(maxContextBytes) || maxContextBytes <= 0 || bytes > maxContextBytes)
    return { kind: "size" };
  return { kind: "retained", repair };
}

export function wikiSynthesisCreationRepairMessages(
  messages: readonly ModelMessage[],
  repair: WikiSynthesisCreationRepair | null,
  ownedContexts: Set<string>,
): ModelMessage[] {
  const context = repair ? wikiSynthesisCreationRepairContext(repair) : null;
  if (context) ownedContexts.add(context);
  const retained = messages.filter(
    (message) =>
      !(message.role === "user" && typeof message.content === "string" && ownedContexts.has(message.content)),
  );
  return context ? [...retained, { role: "user", content: context }] : retained;
}
