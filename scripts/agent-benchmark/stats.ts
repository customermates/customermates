export type EpisodeOutcome = { arm: string; caseId: string; repetition: number; passed: boolean; usd: number; judge: number | null };

export function passRate(outcomes: readonly { passed: boolean }[]): number {
  if (outcomes.length === 0) return 0;
  return outcomes.filter((outcome) => outcome.passed).length / outcomes.length;
}

export function passAtLeastK(outcomes: readonly EpisodeOutcome[], k: number): number {
  const byCase = new Map<string, boolean[]>();
  for (const outcome of outcomes) byCase.set(outcome.caseId, [...(byCase.get(outcome.caseId) ?? []), outcome.passed]);
  const eligible = [...byCase.values()].filter((results) => results.length >= k);
  if (eligible.length === 0) return 0;
  return eligible.filter((results) => results.slice(0, k).every(Boolean)).length / eligible.length;
}

export function costPerSuccessfulTask(outcomes: readonly EpisodeOutcome[]): number | null {
  const successes = outcomes.filter((outcome) => outcome.passed).length;
  if (successes === 0) return null;
  return outcomes.reduce((total, outcome) => total + outcome.usd, 0) / successes;
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export function caseRates(outcomes: readonly EpisodeOutcome[]): Map<string, number> {
  const grouped = new Map<string, boolean[]>();
  for (const outcome of outcomes) grouped.set(outcome.caseId, [...(grouped.get(outcome.caseId) ?? []), outcome.passed]);
  return new Map([...grouped].map(([caseId, results]) => [caseId, passRate(results.map((passed) => ({ passed })))]));
}

export type PairedComparison = {
  cases: number;
  wins: number;
  losses: number;
  ties: number;
  meanDifference: number;
  signTestP: number;
  floor: number;
};

function binomialTwoSidedP(successes: number, trials: number): number {
  if (trials === 0) return 1;
  const probability = (k: number) => {
    let coefficient = 1;
    for (let i = 1; i <= k; i += 1) coefficient = (coefficient * (trials - k + i)) / i;
    return coefficient / 2 ** trials;
  };
  const extreme = Math.min(successes, trials - successes);
  let p = 0;
  for (let k = 0; k <= extreme; k += 1) p += probability(k);
  return Math.min(1, 2 * p);
}

export function comparePaired(candidate: readonly EpisodeOutcome[], control: readonly EpisodeOutcome[]): PairedComparison {
  const candidateRates = caseRates(candidate);
  const controlRates = caseRates(control);
  const shared = [...candidateRates.keys()].filter((caseId) => controlRates.has(caseId));
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let differenceSum = 0;
  for (const caseId of shared) {
    const difference = (candidateRates.get(caseId) ?? 0) - (controlRates.get(caseId) ?? 0);
    differenceSum += difference;
    if (difference > 0) wins += 1;
    else if (difference < 0) losses += 1;
    else ties += 1;
  }
  const discordant = wins + losses;
  return {
    cases: shared.length,
    wins,
    losses,
    ties,
    meanDifference: shared.length ? differenceSum / shared.length : 0,
    signTestP: binomialTwoSidedP(wins, discordant),
    floor: discordant > 0 ? Math.min(1, 2 / 2 ** discordant) : 1,
  };
}

export function holmAdjust(pValues: readonly { key: string; p: number }[]): Map<string, number> {
  const sorted = [...pValues].sort((a, b) => a.p - b.p);
  const adjusted = new Map<string, number>();
  let running = 0;
  sorted.forEach((entry, index) => {
    const scaled = Math.min(1, entry.p * (sorted.length - index));
    running = Math.max(running, scaled);
    adjusted.set(entry.key, running);
  });
  return adjusted;
}

export function uniformlyFailingChecks(checksByEpisode: readonly (readonly { id: string; passed: boolean }[])[]): string[] {
  const seen = new Map<string, { passed: number; total: number }>();
  for (const checks of checksByEpisode)
    for (const check of checks) {
      const entry = seen.get(check.id) ?? { passed: 0, total: 0 };
      entry.total += 1;
      if (check.passed) entry.passed += 1;
      seen.set(check.id, entry);
    }
  return [...seen].filter(([, entry]) => entry.passed === 0 && entry.total >= 3).map(([id]) => id).sort();
}
