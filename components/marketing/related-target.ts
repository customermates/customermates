export const RELATED_ROUTE_SEGMENTS = ["blog", "compare", "docs", "features", "for"] as const;

export type RelatedRouteSegment = (typeof RELATED_ROUTE_SEGMENTS)[number];

export type ResolvedRelatedTarget = {
  description: string;
  imageSrc?: string;
  title: string;
};

export type RelatedTargetResolver = (
  slug: string,
  locale: string,
  alternativeTitle: (competitor: string) => string,
) => ResolvedRelatedTarget | null;

export function resolveRelatedTarget(
  href: string,
  locale: string,
  alternativeTitle: (competitor: string) => string,
  resolvers: Record<RelatedRouteSegment, RelatedTargetResolver>,
): ResolvedRelatedTarget {
  const match = /^\/(blog|compare|docs|features|for)\/([^/]+)$/u.exec(href);
  if (!match) throw new Error(`RelatedPage href "${href}" is not a related-page route`);

  const segment = match[1] as RelatedRouteSegment;
  const slug = match[2];
  const target = resolvers[segment](slug, locale, alternativeTitle);

  if (!target) throw new Error(`RelatedPage href "${href}" resolves to no published page in ${locale}`);

  return target;
}
