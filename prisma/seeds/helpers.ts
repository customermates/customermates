export function fixtureId(group: string, index: number): string {
  return `${group}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

export function relationshipTarget(
  links: ReadonlyArray<readonly [number, number]>,
  sourceIndex: number,
  relationshipName: string,
): number {
  const link = links.find(([candidateIndex]) => candidateIndex === sourceIndex);
  if (!link) throw new Error(`Missing ${relationshipName} fixture link for index ${sourceIndex}`);
  return link[1];
}

export function relationshipTargets(links: ReadonlyArray<readonly [number, number]>, sourceIndex: number): number[] {
  return links.filter(([candidateIndex]) => candidateIndex === sourceIndex).map(([, targetIndex]) => targetIndex);
}

const FIXTURE_UPSERT_CONCURRENCY = 10;

export async function upsertFixturesById<T extends { id: string }>(
  fixtures: ReadonlyArray<T>,
  upsert: (fixture: T) => Promise<unknown>,
): Promise<void> {
  for (let start = 0; start < fixtures.length; start += FIXTURE_UPSERT_CONCURRENCY) {
    const batch = fixtures.slice(start, start + FIXTURE_UPSERT_CONCURRENCY);
    await Promise.all(batch.map((fixture) => upsert(fixture)));
  }
}
