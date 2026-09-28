import type { ClassifierCharge, MeteredClassifierModel } from "./classifier/metered";

export type AgentDocsRerankTrace = {
  model: MeteredClassifierModel;
  calls: number;
  answered: number;
  costMicrocents: number;
  measured: boolean;
};

export type AgentTurnClassifierTrace = {
  auxiliaryCostMicrocents: number;
  auxiliaryMeasured: boolean;
  docsRerank: AgentDocsRerankTrace | null;
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

export function buildAgentTurnClassifierTrace(charges: readonly ClassifierCharge[]): AgentTurnClassifierTrace | null {
  if (charges.length === 0) return null;
  const auxiliary = agentAuxiliaryCharge(charges);
  return {
    auxiliaryCostMicrocents: auxiliary.costMicrocents,
    auxiliaryMeasured: auxiliary.measured,
    docsRerank: traceOfUse(charges.filter((charge) => charge.use === "docs_rerank")),
  };
}

export function isAgentTurnClassifierTrace(value: unknown): value is AgentTurnClassifierTrace {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const trace = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(trace.auxiliaryCostMicrocents) &&
    (trace.auxiliaryCostMicrocents as number) >= 0 &&
    typeof trace.auxiliaryMeasured === "boolean" &&
    (trace.docsRerank === null || typeof trace.docsRerank === "object")
  );
}
