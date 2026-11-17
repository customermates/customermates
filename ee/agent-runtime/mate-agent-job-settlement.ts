import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { AgentUsageSettlement } from "@/ee/agent-chat/agent-usage-settlement";
import type { TokenCounts } from "@/ee/agent-chat/model-pricing";
import type { AgentJobStepUsage } from "./run-agent-job-loop";

import { buildAgentUsageSettlement } from "@/ee/agent-chat/agent-usage-settlement";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";

type StepCost = { costMicrocents: number; measured: boolean; unreadableReason: string | null };

export function mateStepCost(step: AgentJobStepUsage, budget: AgentTurnBudget): StepCost {
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

export function mateJobOutOfBudget(steps: readonly AgentJobStepUsage[], budget: AgentTurnBudget): boolean {
  const spent = steps.reduce((total, step) => total + mateStepCost(step, budget).costMicrocents, 0);
  return spent + budget.roundReserveMicrocents > budget.reservedMicrocents;
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
): AgentUsageSettlement {
  const costs = steps.map((step) => mateStepCost(step, budget));
  const measured = costs.every((cost) => cost.measured);
  return buildAgentUsageSettlement({
    model: budget.modelSpec,
    provider: budget.servingProvider,
    inferenceRegion: budget.inferenceRegion,
    tokens: sumStepTokens(steps),
    reservedMicrocents: budget.reservedMicrocents,
    providerCharge: {
      billed: steps.length > 0,
      measuredCostMicrocents: measured ? costs.reduce((total, cost) => total + cost.costMicrocents, 0) : null,
      estimatedCostMicrocents: measured ? undefined : costs.reduce((total, cost) => total + cost.costMicrocents, 0),
      stepTokens: steps.map((step) => step.tokens),
      unreadableReason: costs.find((cost) => cost.unreadableReason)?.unreadableReason ?? null,
    },
  });
}
