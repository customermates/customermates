import type { TOCItemType } from "fumadocs-core/toc";
import type { ReactNode } from "react";

import { Toc } from "@/components/shared/toc";

import { MarketingSection } from "./marketing-section";

type Props = {
  children: ReactNode;
  items: TOCItemType[];
};

export function LandingArticle({ children, items }: Props) {
  return (
    <MarketingSection
      className="py-12 sm:py-16 lg:py-20"
      containerClassName="[--toc-anchor-offset:5.5rem]"
      tone="canvas"
    >
      <div className="rounded-panel border border-border bg-background px-5 py-8 shadow-sm sm:px-8 sm:py-10 lg:px-12 lg:py-12">
        <Toc items={items}>
          <div className="prose prose-sm prose-neutral max-w-[72ch] dark:prose-invert prose-headings:text-balance prose-headings:tracking-tight prose-a:font-medium prose-a:decoration-primary/40 prose-a:underline-offset-4 prose-img:rounded-card">
            {children}
          </div>
        </Toc>
      </div>
    </MarketingSection>
  );
}
