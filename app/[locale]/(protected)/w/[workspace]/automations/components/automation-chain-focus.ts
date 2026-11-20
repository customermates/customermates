export type ChainFocus = { card: string } | { connector: number };

export function focusAfterRemoval(
  group: "condition" | "effect",
  index: number,
  counts: { conditions: number; effects: number },
): ChainFocus {
  const conditions = counts.conditions - (group === "condition" ? 1 : 0);
  const effects = counts.effects - (group === "effect" ? 1 : 0);
  if (group === "condition") {
    if (index < conditions) return { card: `condition-${index}` };
    if (effects > 0) return { card: "effect-0" };
  } else if (index < effects) return { card: `effect-${index}` };
  return { connector: conditions + effects };
}
