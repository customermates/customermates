import type { Hero } from "@/core/fumadocs/schemas/features";

import { LandingHero } from "@/components/marketing/landing-hero";

export function FeaturesHero(hero: Hero) {
  return <LandingHero hero={hero} />;
}
