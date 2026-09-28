import { z } from "zod";

export const DEAL_GROUP_SUM_FIELDS = { total: "totalValue", weighted: "weightedValue" } as const;

const MIN_DEAL_STAGE_WEIGHT = 0;
const MAX_DEAL_STAGE_WEIGHT = 100;

export function isDealStageWeight(weight: number): boolean {
  return weight >= MIN_DEAL_STAGE_WEIGHT && weight <= MAX_DEAL_STAGE_WEIGHT;
}

export function dealStageWeightSchema(params?: { error?: string }) {
  return z.number().min(MIN_DEAL_STAGE_WEIGHT, params).max(MAX_DEAL_STAGE_WEIGHT, params);
}

type StoredOption = { value?: unknown; weight?: unknown };

export function readOptionWeights(options: unknown): Map<string, number> {
  const weights = new Map<string, number>();
  const stored = (options as { options?: unknown } | null | undefined)?.options;

  if (!Array.isArray(stored)) return weights;

  for (const option of stored as StoredOption[]) {
    if (typeof option?.value !== "string") continue;
    if (typeof option?.weight !== "number" || !Number.isFinite(option.weight)) continue;
    weights.set(option.value, option.weight);
  }

  return weights;
}

export function computeWeightedValue(totalValue: number, weight: number | undefined): number | null {
  if (weight === undefined) return null;

  return (totalValue * weight) / 100;
}
