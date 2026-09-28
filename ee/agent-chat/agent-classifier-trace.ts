import type { RetrievalTiming } from "@/core/retrieval/retrieval-context";
import type { ClassifierModel } from "./classifier";
import type { ClassifierCharge } from "./classifier/metered";

type AgentDocsRerankTrace = {
  model: ClassifierModel;
  calls: number;
  answered: number;
  costMicrocents: number;
  measured: boolean;
};

export type AgentTurnClassifierTrace = {
  auxiliaryCostMicrocents: number;
  auxiliaryMeasured: boolean;
  docsRerank: AgentDocsRerankTrace | null;
  wikiRerank?: AgentDocsRerankTrace | null;
  retrieval?: RetrievalTiming[];
};

export function agentAuxiliaryCharge(charges: readonly ClassifierCharge[]) {
  return {
    costMicrocents: charges.reduce((total, charge) => total + charge.costMicrocents, 0),
    measured: charges.every((charge) => charge.measured),
  };
}

function traceOfUse(charges: readonly ClassifierCharge[]): AgentDocsRerankTrace | null {
  return charges.length
    ? {
        model: charges[0].model,
        calls: charges.length,
        answered: charges.filter((charge) => charge.answered).length,
        ...agentAuxiliaryCharge(charges),
      }
    : null;
}

const TRACE_RETRIEVAL_ENTRIES = 32;

export function buildAgentTurnClassifierTrace(
  charges: readonly ClassifierCharge[],
  retrieval: readonly RetrievalTiming[] = [],
): AgentTurnClassifierTrace | null {
  if (charges.length === 0 && retrieval.length === 0) return null;
  const auxiliary = agentAuxiliaryCharge(charges);
  const wikiRerank = traceOfUse(charges.filter((charge) => charge.use === "wiki_rerank"));
  return {
    auxiliaryCostMicrocents: auxiliary.costMicrocents,
    auxiliaryMeasured: auxiliary.measured,
    docsRerank: traceOfUse(charges.filter((charge) => charge.use === "docs_rerank")),
    ...(wikiRerank ? { wikiRerank } : {}),
    ...(retrieval.length > 0 ? { retrieval: retrieval.slice(0, TRACE_RETRIEVAL_ENTRIES) } : {}),
  };
}

export function isAgentTurnClassifierTrace(value: unknown): value is AgentTurnClassifierTrace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const trace = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(trace.auxiliaryCostMicrocents) &&
    (trace.auxiliaryCostMicrocents as number) >= 0 &&
    typeof trace.auxiliaryMeasured === "boolean" &&
    (trace.docsRerank === null || typeof trace.docsRerank === "object") &&
    (trace.wikiRerank === undefined || trace.wikiRerank === null || typeof trace.wikiRerank === "object") &&
    (trace.retrieval === undefined || Array.isArray(trace.retrieval))
  );
}
