export function recordInvariant<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Record engine data invariant violated");
  return value;
}
