import type { Walkthrough } from "@/core/fumadocs/schemas/homepage";

import { Check } from "lucide-react";

import { MarketingSection } from "@/components/marketing/marketing-section";

type Props = {
  walkthrough: Walkthrough;
};

export function HomepageWalkthrough({ walkthrough }: Props) {
  const { badge, title, titleAccent, videoSrc, bullets } = walkthrough;
  const heading = titleAccent ? `${title} ${titleAccent}` : title;

  return (
    <MarketingSection eyebrow={badge} id="walkthrough" title={heading}>
      <div className="mt-12 grid w-full grid-cols-1 items-center gap-10 lg:mt-16 lg:grid-cols-[1.55fr_1fr] lg:gap-14">
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <div className="relative aspect-video w-full bg-placeholder">
            {videoSrc && (
              <video
                autoPlay
                controls
                loop
                muted
                playsInline
                className="absolute inset-0 size-full object-cover"
                preload="metadata"
                src={videoSrc}
              />
            )}
          </div>
        </div>

        <ul className="flex flex-col gap-7">
          {bullets.map((bullet) => (
            <li key={bullet.title} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Check className="size-3.5" strokeWidth={3} />
              </span>

              <div>
                <p className="font-medium leading-tight">{bullet.title}</p>

                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{bullet.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </MarketingSection>
  );
}
