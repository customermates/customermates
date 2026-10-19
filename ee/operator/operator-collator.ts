export function operatorCollator(): Pick<Intl.Collator, "compare"> {
  return { compare: (left, right) => (left < right ? -1 : left > right ? 1 : 0) };
}
