export function orderByOptionIndex<T>(options: readonly T[]): T[] {
  return options
    .map((option, position) => ({ option, position }))
    .sort((left, right) => optionIndex(left) - optionIndex(right) || left.position - right.position)
    .map((entry) => entry.option);
}

function optionIndex({ option, position }: { option: unknown; position: number }): number {
  const declared = (option as { index?: unknown } | null)?.index;

  return typeof declared === "number" && Number.isFinite(declared) ? declared : position;
}
