import type { ClassifierModel } from "./classifier";
import type { ClassifierCharge } from "./classifier/metered";

export type AgentToolsetPreloadTrace = {
  model: ClassifierModel;
  answered: boolean;
  lexicon: string[];
  predicted: string[];
  added: string[];
  costMicrocents: number;
  measured: boolean;
};

export type AgentDocsRerankTrace = {
  model: ClassifierModel;
  calls: number;
  answered: number;
  costMicrocents: number;
  measured: boolean;
};

export type AgentTurnClassifierTrace = {
  auxiliaryCostMicrocents: number;
  auxiliaryMeasured: boolean;
  toolsetPreload: AgentToolsetPreloadTrace | null;
  docsRerank: AgentDocsRerankTrace | null;
};

export function agentAuxiliaryCharge(charges: readonly ClassifierCharge[]) {
  return {
    costMicrocents: charges.reduce((total, charge) => total + charge.costMicrocents, 0),
    measured: charges.every((charge) => charge.measured),
  };
}

export function buildAgentTurnClassifierTrace(
  toolsetPreload: AgentToolsetPreloadTrace | null,
  charges: readonly ClassifierCharge[],
): AgentTurnClassifierTrace | null {
  if (!toolsetPreload && charges.length === 0) return null;
  const docs = charges.filter((charge) => charge.use === "docs_rerank");
  const auxiliary = agentAuxiliaryCharge(charges);
  return {
    auxiliaryCostMicrocents: auxiliary.costMicrocents,
    auxiliaryMeasured: auxiliary.measured,
    toolsetPreload,
    docsRerank: docs.length
      ? {
          model: docs[0].model,
          calls: docs.length,
          answered: docs.filter((charge) => charge.answered).length,
          ...agentAuxiliaryCharge(docs),
        }
      : null,
  };
}

export function isAgentTurnClassifierTrace(value: unknown): value is AgentTurnClassifierTrace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const trace = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(trace.auxiliaryCostMicrocents) &&
    (trace.auxiliaryCostMicrocents as number) >= 0 &&
    typeof trace.auxiliaryMeasured === "boolean" &&
    (trace.toolsetPreload === null || typeof trace.toolsetPreload === "object") &&
    (trace.docsRerank === null || typeof trace.docsRerank === "object")
  );
}
