export function assertValidDate(value: Date, description: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error(`${description} is invalid.`);
}
