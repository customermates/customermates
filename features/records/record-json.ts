export function compareRecordKey(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalRecordJson(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => compareRecordKey(left, right)))
      : entry,
  );
}
