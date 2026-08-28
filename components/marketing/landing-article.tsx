import type { TOCItemType } from "fumadocs-core/toc";
import type { ReactNode } from "react";

import { Toc } from "@/components/shared/toc";

import { FounderContactCard } from "./founder-contact-card";
import { MarketingSection } from "./marketing-section";

type Props = {
  children: ReactNode;
  founderContact?: boolean;
  items: TOCItemType[];
};

export function LandingArticle({ children, founderContact = false, items }: Props) {
  return (
    <MarketingSection
      className="py-12 sm:py-16 lg:py-20"
      containerClassName="[--toc-anchor-offset:5.5rem] [--toc-sticky-top:5.5rem]"
      tone="canvas"
    >
      <Toc asideFooter={founderContact ? <FounderContactCard /> : undefined} items={items} layout="article">
        <div className="prose prose-sm prose-neutral mx-auto max-w-[96ch] dark:prose-invert prose-headings:text-balance prose-headings:tracking-tight prose-a:font-medium prose-a:decoration-primary/40 prose-a:underline-offset-4 prose-img:rounded-card lg:mx-0 lg:max-w-none [&>ol]:max-w-[82ch] [&>p]:max-w-[82ch] [&>ul]:max-w-[82ch]">
          {children}
        </div>
      </Toc>
    </MarketingSection>
  );
}
