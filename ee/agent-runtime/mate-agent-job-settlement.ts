import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { AgentUsageSettlement } from "@/ee/agent-chat/agent-usage-settlement";
import type { ClassifierCharge } from "@/ee/agent-chat/classifier/metered";
import type { TokenCounts } from "@/ee/agent-chat/model-pricing";
import type { AgentJobStepUsage } from "./run-agent-job-loop";

import { agentAuxiliaryCharge } from "@/ee/agent-chat/agent-classifier-trace";
import { buildAgentUsageSettlement } from "@/ee/agent-chat/agent-usage-settlement";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";

type StepCost = { costMicrocents: number; measured: boolean; unreadableReason: string | null };

const NO_USAGE_EVIDENCE = "a provider round reported no usage evidence";

export function mateStepCost(step: AgentJobStepUsage, budget: AgentTurnBudget): StepCost {
  if (step.unmeasuredMicrocents !== undefined)
    return { costMicrocents: step.unmeasuredMicrocents, measured: false, unreadableReason: NO_USAGE_EVIDENCE };
  const reading = readAgentProviderCharge(step.providerMetadata, budget.servingProvider);
  if (reading.outcome === "measured")
    return { costMicrocents: reading.charge.costMicrocents, measured: true, unreadableReason: null };
  if (reading.outcome === "notBilled") return { costMicrocents: 0, measured: true, unreadableReason: null };
  return {
    costMicrocents: computeCostMicrocents(
      budget.modelSpec,
      step.tokens,
      budget.servingProvider,
      budget.inferenceRegion,
    ),
    measured: false,
    unreadableReason: reading.reason,
  };
}

export function mateJobSpentMicrocents(
  steps: readonly AgentJobStepUsage[],
  auxiliary: readonly ClassifierCharge[],
  budget: AgentTurnBudget,
): number {
  return (
    steps.reduce((total, step) => total + mateStepCost(step, budget).costMicrocents, 0) +
    agentAuxiliaryCharge(auxiliary).costMicrocents
  );
}

export function sumStepTokens(steps: readonly AgentJobStepUsage[]): TokenCounts {
  return steps.reduce<TokenCounts>(
    (total, step) => ({
      inputTokens: total.inputTokens + step.tokens.inputTokens,
      outputTokens: total.outputTokens + step.tokens.outputTokens,
      cacheReadTokens: total.cacheReadTokens + step.tokens.cacheReadTokens,
      cacheWriteTokens: total.cacheWriteTokens + step.tokens.cacheWriteTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );
}

export function buildMateJobSettlement(
  steps: readonly AgentJobStepUsage[],
  budget: AgentTurnBudget,
  auxiliary: readonly ClassifierCharge[] = [],
): AgentUsageSettlement {
  const costs = steps.map((step) => mateStepCost(step, budget));
  const measured = costs.every((cost) => cost.measured);
  const stepsCostMicrocents = costs.reduce((total, cost) => total + cost.costMicrocents, 0);
  return buildAgentUsageSettlement({
    model: budget.modelSpec,
    provider: budget.servingProvider,
    inferenceRegion: budget.inferenceRegion,
    tokens: sumStepTokens(steps),
    reservedMicrocents: budget.reservedMicrocents,
    auxiliary: agentAuxiliaryCharge(auxiliary),
    providerCharge: {
      billed: steps.length > 0,
      measuredCostMicrocents: measured ? stepsCostMicrocents : null,
      estimatedCostMicrocents: measured ? undefined : stepsCostMicrocents,
      stepTokens: steps.map((step) => step.tokens),
      unreadableReason: costs.find((cost) => cost.unreadableReason)?.unreadableReason ?? null,
    },
  });
}
