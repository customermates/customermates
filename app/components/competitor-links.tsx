"use client";

import { AppLink } from "@/components/shared/app-link";

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
          <AppLink
            appearance="unstyled"
            className="text-subdued transition-colors hover:text-foreground focus-visible:text-foreground"
            href={`/compare/${slug}`}
          >
            {displayName}
          </AppLink>
        </li>
      ))}
    </>
  );
}
