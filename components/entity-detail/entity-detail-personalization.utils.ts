function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function resolveDetailFieldOrder(currentIds: string[], storedOrder: string[] | undefined): string[] {
  const current = uniqueIds(currentIds);
  const available = new Set(current);
  const saved = uniqueIds(storedOrder ?? []).filter((id) => available.has(id));
  if (saved.length === 0) return current;
  const savedSet = new Set(saved);
  const missing = current.filter((id) => !savedSet.has(id));
  const isTimestamp = (id: string) => ["createdAt", "updatedAt", "system:createdAt", "system:updatedAt"].includes(id);
  const firstTimestamp = saved.findIndex(isTimestamp);
  const insertionIndex = firstTimestamp < 0 ? saved.length : firstTimestamp;
  return [
    ...saved.slice(0, insertionIndex),
    ...missing.filter((id) => !isTimestamp(id)),
    ...saved.slice(insertionIndex),
    ...missing.filter(isTimestamp),
  ];
}
