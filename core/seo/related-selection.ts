export const RELATED_LINK_COUNT = 4;

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
