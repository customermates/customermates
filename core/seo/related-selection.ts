export const RELATED_LINK_COUNT = 3;
export const RELATED_PAGE_LINK_COUNT = 4;

export type RelatedEntry = {
  curated: readonly string[];
  slug: string;
};

export function selectRelatedSlugs(
  slug: string,
  ordered: readonly string[],
  size: number = RELATED_LINK_COUNT,
): string[] {
  const ring = [...new Set(ordered)];
  const position = ring.indexOf(slug);

  if (position === -1) return [];

  const reach = Math.max(0, Math.min(size, ring.length - 1));

  return Array.from({ length: reach }, (_, offset) => ring[(position + offset + 1) % ring.length]);
}

function compareIdentifiers(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function ringOrder<T>(items: readonly T[], groupOf: (item: T) => string, slugOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const group = compareIdentifiers(groupOf(a), groupOf(b));
    return group === 0 ? compareIdentifiers(slugOf(a), slugOf(b)) : group;
  });
}

function leastLinkedSlug(
  ordered: readonly RelatedEntry[],
  inboundCount: ReadonlyMap<string, number>,
  self: string,
  taken: readonly string[],
): string | null {
  let chosen: string | null = null;
  let chosenCount = Number.POSITIVE_INFINITY;

  for (const entry of ordered) {
    if (entry.slug === self || taken.includes(entry.slug)) continue;

    const count = inboundCount.get(entry.slug) ?? 0;
    if (count < chosenCount) {
      chosen = entry.slug;
      chosenCount = count;
    }
  }

  return chosen;
}

export function planRelatedLinks(
  entries: readonly RelatedEntry[],
  size: number = RELATED_PAGE_LINK_COUNT,
): Map<string, string[]> {
  const ordered = ringOrder(
    entries,
    () => "",
    (entry) => entry.slug,
  );
  const published = new Set(ordered.map((entry) => entry.slug));
  const inboundCount = new Map<string, number>(ordered.map((entry) => [entry.slug, 0]));
  const plan = new Map<string, string[]>();

  for (const entry of ordered) {
    const chosen: string[] = [];

    for (const candidate of entry.curated) {
      if (chosen.length >= size) break;
      if (candidate === entry.slug || !published.has(candidate) || chosen.includes(candidate)) continue;

      chosen.push(candidate);
      inboundCount.set(candidate, (inboundCount.get(candidate) ?? 0) + 1);
    }

    plan.set(entry.slug, chosen);
  }

  for (const entry of ordered) {
    const chosen = plan.get(entry.slug) ?? [];

    while (chosen.length < size) {
      const candidate = leastLinkedSlug(ordered, inboundCount, entry.slug, chosen);
      if (!candidate) break;

      chosen.push(candidate);
      inboundCount.set(candidate, (inboundCount.get(candidate) ?? 0) + 1);
    }
  }

  return plan;
}
