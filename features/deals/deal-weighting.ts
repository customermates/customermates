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
