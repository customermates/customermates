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
      <Toc items={items} layout="article">
        <div className="prose prose-sm prose-neutral max-w-[72ch] dark:prose-invert prose-headings:text-balance prose-headings:tracking-tight prose-a:font-medium prose-a:decoration-primary/40 prose-a:underline-offset-4 prose-img:rounded-card">
          {children}
        </div>
      </Toc>
    </MarketingSection>
  );
}
