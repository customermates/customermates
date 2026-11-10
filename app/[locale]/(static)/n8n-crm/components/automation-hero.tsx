import type { Hero } from "@/core/fumadocs/schemas/automation";

import { LandingHero } from "@/components/marketing/landing-hero";

export function AutomationHero({ startFree, subtitle, ...hero }: Hero) {
  return <LandingHero hero={{ ...hero, description: subtitle, hint: startFree }} />;
}
