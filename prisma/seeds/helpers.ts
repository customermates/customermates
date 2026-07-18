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

export async function upsertFixturesById<T extends { id: string }>(
  fixtures: ReadonlyArray<T>,
  upsert: (fixture: T) => Promise<unknown>,
): Promise<void> {
  for (const fixture of fixtures) await upsert(fixture);
}
