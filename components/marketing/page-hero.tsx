import Link from "next/link";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";

import { AgplGithubBadge } from "./agpl-github-badge";
import { WaveDecoration } from "./wave-decoration";

type Props = {
  badge?: string;
  buttonLeftHref: string;
  buttonLeftText: string;
  buttonRightHref: string;
  buttonRightText: string;
  description: string;
  hint: string;
  title: string;
  titleAccent?: string;
};

export function PageHero({
  badge,
  title,
  titleAccent,
  description,
  buttonLeftHref,
  buttonLeftText,
  buttonRightHref,
  buttonRightText,
  hint,
}: Props) {
  return (
    <div className="relative isolate w-full">
      <WaveDecoration
        className="-top-24 -left-40 w-[min(1080px,90vw)] md:-top-40 md:-left-60"
        opacity={0.5}
        variant="wave-1"
      />

      <WaveDecoration
        className="-top-16 right-0 hidden w-[min(720px,60vw)] md:block md:-top-8 md:-right-24"
        opacity={0.35}
        variant="wave-2"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-16 z-[5] h-[760px] bg-[radial-gradient(ellipse_70%_75%_at_50%_50%,var(--background)_0%,color-mix(in_oklab,var(--background)_85%,transparent)_25%,color-mix(in_oklab,var(--background)_55%,transparent)_50%,color-mix(in_oklab,var(--background)_20%,transparent)_75%,transparent_100%)]"
      />

      <div className="relative z-10 flex flex-col items-center">
        <AgplGithubBadge />

        {badge ? (
          <div className="mb-4 flex justify-center">
            <AppChip variant="secondary">{badge}</AppChip>
          </div>
        ) : null}

        <h1 className="text-x-4xl mx-auto max-w-4xl px-4 text-center">{title}</h1>

        {titleAccent ? (
          <div
            className="mx-auto mt-1.5 px-4 text-center text-[26px] italic text-primary sm:text-[32px] md:text-[36px] tracking-[-0.02em]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {titleAccent}
          </div>
        ) : null}

        <h2 className="text-x-lg mx-auto max-w-4xl px-4 pt-4 text-center text-subdued md:pt-6">{description}</h2>

        <div className="my-8 flex flex-col items-center px-4 md:my-10">
          <div className="flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row md:gap-6">
            <Button asChild className="w-full sm:w-auto" size="lg" variant="default">
              <Link href={buttonLeftHref}>{buttonLeftText}</Link>
            </Button>

            <Button asChild className="w-full sm:w-auto" size="lg" variant="outline">
              <Link href={buttonRightHref} target="_blank">
                {buttonRightText}
              </Link>
            </Button>
          </div>

          <p className="text-x-sm mt-6 flex items-center justify-center gap-2 text-center text-subdued">{hint}</p>
        </div>
      </div>
    </div>
  );
}
