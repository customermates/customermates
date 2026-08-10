export function calendarEventTitle(title: string, noTitleLabel: string): string {
  const normalized = title.trim();
  return normalized && normalized.toLowerCase() !== "(no title)" ? normalized : noTitleLabel;
}
