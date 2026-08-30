import type { Hero } from "@/core/fumadocs/schemas/features";

import { PageHero } from "@/components/marketing/page-hero";

type Props = Hero;

export function FeaturesHero(props: Props) {
  return <PageHero {...props} />;
}
