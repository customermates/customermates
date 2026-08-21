import type { Walkthrough } from "@/core/fumadocs/schemas/homepage";

import { Check } from "lucide-react";

type Props = {
  walkthrough: Walkthrough;
};

export function HomepageWalkthrough({ walkthrough }: Props) {
  const { badge, title, titleAccent, videoSrc, bullets } = walkthrough;

  return (
    <section
      className="w-full border-b border-foreground/15 py-20 sm:py-24 lg:py-32"
      data-homepage-section="walkthrough"
      id="walkthrough"
    >
      <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(180px,0.45fr)_minmax(0,1.55fr)] lg:gap-12">
          <p className="pt-1 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">{badge}</p>

          {/* eslint-disable react/jsx-newline */}
          <h2 className="m-0 max-w-[980px] text-[clamp(2.5rem,5.4vw,5.5rem)] font-medium leading-[0.98] tracking-[-0.05em] text-balance">
            {title} <span className="font-serif font-normal italic tracking-[-0.035em]">{titleAccent}</span>
          </h2>
          {/* eslint-enable react/jsx-newline */}
        </div>

        <div className="mt-12 grid items-stretch gap-5 lg:mt-16 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <div className="relative min-h-[280px] overflow-hidden rounded-[24px] border border-foreground/10 bg-[#080808] sm:min-h-[420px] lg:min-h-[640px]">
            {videoSrc ? (
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
            ) : null}
          </div>

          <ul className="flex flex-col rounded-[24px] bg-muted/45 px-5 sm:px-7">
            {bullets.map((bullet) => (
              <li
                key={bullet.title}
                className="grid flex-1 grid-cols-[auto_1fr] content-center gap-4 border-b border-foreground/15 py-6 last:border-b-0 lg:py-8"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-foreground/20">
                  <Check className="size-3.5" strokeWidth={2.5} />
                </span>

                <div>
                  <h3 className="text-base font-medium leading-tight tracking-[-0.02em]">{bullet.title}</h3>

                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{bullet.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
