export function isoDateOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dateOfIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDaysToIso(value: string, days: number): string {
  const date = dateOfIso(value);
  date.setDate(date.getDate() + days);
  return isoDateOf(date);
}
