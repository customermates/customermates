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
  mode?: "parallel-v2";
  rejected?: string[];
  removed?: string[];
  appliedAtRound?: number | null;
};

export type AgentDocsRerankTrace = {
  model: ClassifierModel;
  calls: number;
  answered: number;
  costMicrocents: number;
  measured: boolean;
};

export type AgentGuardBulkTrace = AgentDocsRerankTrace & { covered: number };
export type AgentTurnClassifierTrace = {
  auxiliaryCostMicrocents: number;
  auxiliaryMeasured: boolean;
  toolsetPreload: AgentToolsetPreloadTrace | null;
  docsRerank: AgentDocsRerankTrace | null;
  guardBulk?: AgentGuardBulkTrace | null;
  promptBytesByRound?: number[];
};

export type AgentTurnTraceExtras = { promptBytesByRound?: readonly number[]; guardCovered?: number };

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
export function agentAuxiliaryCharge(charges: readonly ClassifierCharge[]) {
  return {
    costMicrocents: charges.reduce((total, charge) => total + charge.costMicrocents, 0),
    measured: charges.every((charge) => charge.measured),
  };
}

export function buildAgentTurnClassifierTrace(
  toolsetPreload: AgentToolsetPreloadTrace | null,
  charges: readonly ClassifierCharge[],
  extras: AgentTurnTraceExtras = {},
): AgentTurnClassifierTrace | null {
  const promptBytesByRound = extras.promptBytesByRound ?? [];
  if (!toolsetPreload && charges.length === 0 && promptBytesByRound.length === 0) return null;
  const auxiliary = agentAuxiliaryCharge(charges);
  const guard = traceOfUse(charges.filter((charge) => charge.use === "guard_bulk"));
  return {
    auxiliaryCostMicrocents: auxiliary.costMicrocents,
    auxiliaryMeasured: auxiliary.measured,
    toolsetPreload,
    docsRerank: traceOfUse(charges.filter((charge) => charge.use === "docs_rerank")),
    ...(guard ? { guardBulk: { ...guard, covered: extras.guardCovered ?? 0 } } : {}),
    ...(promptBytesByRound.length > 0 ? { promptBytesByRound: [...promptBytesByRound] } : {}),
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
    (trace.docsRerank === null || typeof trace.docsRerank === "object") &&
    (trace.guardBulk === undefined || trace.guardBulk === null || typeof trace.guardBulk === "object") &&
    (trace.promptBytesByRound === undefined ||
      (Array.isArray(trace.promptBytesByRound) &&
        trace.promptBytesByRound.every((bytes) => Number.isSafeInteger(bytes) && (bytes as number) >= 0)))
  );
}
