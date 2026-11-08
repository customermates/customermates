export function endOfDayUtc(date: string): Date {
  return new Date(`${date}T23:59:59.999Z`);
}

export function publicLinkEndDate(expiresAt: Date | null): string | null {
  return expiresAt ? expiresAt.toISOString().slice(0, 10) : null;
}
