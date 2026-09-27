export function percentile(
  values: readonly number[],
  p: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

function binomialTail(n: number, k: number) {
  let sum = 0;
  let term = 0.5 ** n;
  for (let i = 0; i <= n; i += 1) {
    if (i >= k) sum += term;
    term = (term * (n - i)) / (i + 1);
  }
  return sum;
}

export function signTestP(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  return Math.min(1, 2 * binomialTail(n, Math.max(wins, losses)));
}

export function majority(values: readonly boolean[]): boolean {
  return values.filter(Boolean).length * 2 > values.length;
}
