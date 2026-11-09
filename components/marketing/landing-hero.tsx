import type { ReactNode } from "react";
import type { Hero } from "@/core/fumadocs/schemas/common";

import { MarketingHero } from "./marketing-hero";

type Props = {
  eyebrow?: string;
  hero: Hero;
  meta?: ReactNode;
};

export function LandingHeroView({ eyebrow, hero, meta }: Props) {
  return (
    <div className="contents" data-landing-hero="">
      <MarketingHero
        description={hero.description}
        eyebrow={hero.eyebrow ?? eyebrow}
        footnotes={
          <>
            <p className="text-muted-foreground">{hero.hint}</p>

            {meta ? <div className="mt-1 text-xs text-muted-foreground">{meta}</div> : null}
          </>
        }
        primary={{ href: hero.buttonLeftHref, label: hero.buttonLeftText }}
        secondary={{ href: hero.buttonRightHref, label: hero.buttonRightText }}
        showOpenSourceBadge={hero.showOpenSourceBadge ?? true}
        title={hero.title}
        titleAccent={hero.titleAccent}
      />
    </div>
  );
}

export function LandingHero(props: Props) {
  return <LandingHeroView {...props} />;
}
