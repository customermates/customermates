import type { Walkthrough } from "@/core/fumadocs/schemas/homepage";

import { Check } from "lucide-react";

import { WaveDecoration } from "@/components/marketing/wave-decoration";

type Props = {
  walkthrough: Walkthrough;
};

export function HomepageWalkthrough({ walkthrough }: Props) {
  const { badge, title, titleAccent, videoSrc, posterSrc, bullets } = walkthrough;

  return (
    <section className="relative w-full overflow-hidden px-4 py-20 md:py-28" id="walkthrough">
      <WaveDecoration
        className="-bottom-20 -left-32 hidden w-[min(620px,55%)] md:block"
        opacity={0.18}
        variant="wave-1"
      />

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-10 right-[6%] size-[360px] rounded-full bg-[rgba(249,115,22,0.10)] blur-[110px]" />

        <div className="absolute bottom-[5%] left-[12%] size-[280px] rounded-full bg-[rgba(236,72,153,0.10)] blur-[90px]" />

        <div
          className="absolute inset-0 opacity-[0.30] bg-[radial-gradient(circle_at_1px_1px,rgba(249,115,22,0.10)_1px,transparent_0)] bg-size-[28px_28px]"
          style={{
            maskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, #000 25%, transparent 85%)",
            WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 50%, #000 25%, transparent 85%)",
          }}
        />
      </div>

      <div className="mx-auto flex max-w-[1240px] flex-col items-center">
        <span className="mb-5 inline-flex items-center rounded-md bg-primary/15 px-3 py-1 text-[13px] font-medium text-primary">
          {badge}
        </span>

        {/* eslint-disable react/jsx-newline */}
        <h2 className="m-0 max-w-[900px] text-center text-[34px] font-bold leading-[1.1] tracking-[-0.025em] sm:text-[44px] md:text-[52px]">
          {title}{" "}
          <span className="italic text-primary" style={{ fontFamily: "var(--font-serif)" }}>
            {titleAccent}
          </span>
        </h2>
        {/* eslint-enable react/jsx-newline */}

        <div className="mt-12 grid w-full grid-cols-1 items-center gap-10 md:mt-16 md:grid-cols-[1.55fr_1fr] md:gap-14">
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[20px] bg-[radial-gradient(circle_at_50%_50%,rgba(94,74,227,0.18),transparent_60%)]"
            />

            <div className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-22px_rgba(0,0,0,0.55)]">
              <div className="relative aspect-video w-full bg-[#0a0a0f]">
                {posterSrc && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img alt="" className="absolute inset-0 size-full object-cover" loading="lazy" src={posterSrc} />
                )}

                {videoSrc && (
                  <video
                    autoPlay
                    controls
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 size-full object-cover"
                    poster={posterSrc}
                    preload="metadata"
                    src={videoSrc}
                  />
                )}
              </div>
            </div>
          </div>

          <ul className="flex flex-col gap-7">
            {bullets.map((bullet) => (
              <li key={bullet.title} className="flex gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>

                <div>
                  <div className="text-[15px] font-semibold leading-tight md:text-[16px]">{bullet.title}</div>

                  <div className="mt-1 text-[13px] leading-[1.55] text-muted-foreground md:text-[14px]">
                    {bullet.description}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
