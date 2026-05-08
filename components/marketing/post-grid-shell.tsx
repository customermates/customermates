import type { ReactNode } from "react";

import type { Hero } from "@/core/fumadocs/schemas/common";

import { PageHero } from "@/components/marketing/page-hero";

type Props = {
  children: ReactNode;
  hero: Hero;
};

export function PostGridShell({ children, hero }: Props) {
  return (
    <div className="flex w-full flex-col items-center pt-16 md:pt-24">
      <PageHero {...hero} />

      <section className="relative w-full pb-16 md:pb-24">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid auto-rows-fr grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3">{children}</div>
        </div>
      </section>
    </div>
  );
}
