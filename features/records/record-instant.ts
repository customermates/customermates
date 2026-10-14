export function recordInstantMicros(value: string): bigint {
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? "";
  return BigInt(Date.parse(value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, ""))) * 1000n + BigInt(fraction.padEnd(6, "0"));
}
