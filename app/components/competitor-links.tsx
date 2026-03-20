"use client";

import { XLink } from "@/components/x-link";

type CompetitorLink = {
  slug: string;
  displayName: string;
};

type Props = {
  competitors: CompetitorLink[];
};

export function CompetitorLinks({ competitors }: Props) {
  if (competitors.length === 0) return null;

  return (
    <>
      {competitors.map(({ slug, displayName }) => (
        <li key={slug}>
          <XLink className="text-subdued" href={`/compare/${slug}`}>
            vs {displayName}
          </XLink>
        </li>
      ))}
    </>
  );
}
