const DOLLAR_INPUT = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/;

export function dollarsToMicrocents(value: string): string | null | undefined {
  const normalized = value.trim();
  if (!normalized) return null;

  const match = DOLLAR_INPUT.exec(normalized);
  if (!match) return undefined;

  const fractional = (match[2] ?? "").padEnd(8, "0");
  return (BigInt(match[1]) * 100_000_000n + BigInt(fractional || "0")).toString();
}

export function microcentsAsDollarInput(value: string | null): string {
  if (value === null) return "";

  const microcents = BigInt(value);
  const whole = microcents / 100_000_000n;
  const fractional = (microcents % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole.toString();
}
