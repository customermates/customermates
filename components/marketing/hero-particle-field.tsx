import { HomepageHeroParticles } from "@/app/[locale]/(static)/components/homepage-hero-particles";

export function HeroParticleField({ mark = true }: { mark?: boolean }) {
  return (
    <div aria-hidden className="homepage-hero-field mk-hero-field-capped" data-hero-particle-field="">
      <HomepageHeroParticles className="block size-full" mark={mark} />
    </div>
  );
}
