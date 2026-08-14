export function widgetSubheader(count: number, formattedTotal: string, groupsLabel: string): string | null {
  if (count === 0) return null;

  return count > 1 ? `${formattedTotal} · ${count} ${groupsLabel}` : formattedTotal;
}
