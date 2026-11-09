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
      className="mk-section-tight"
      containerClassName="[--toc-anchor-offset:5.5rem] [--toc-sticky-top:5.5rem] xl:[--toc-anchor-offset:5rem] xl:[--toc-sticky-top:5rem]"
    >
      <Toc asideFooter={founderContact ? <FounderContactCard /> : undefined} items={items} layout="article">
        <div className="prose prose-neutral mx-auto max-w-[96ch] text-[0.9375rem] leading-7 dark:prose-invert prose-headings:font-semibold prose-headings:text-balance prose-headings:tracking-tight prose-h2:mt-14 prose-h2:text-[1.625rem] prose-h2:leading-tight prose-h3:text-lg prose-a:font-medium prose-a:decoration-foreground/30 prose-a:underline-offset-4 prose-img:rounded-card lg:mx-0 lg:max-w-none [&>ol]:max-w-[82ch] [&>p]:max-w-[82ch] [&>ul]:max-w-[82ch]">
          {children}
        </div>
      </Toc>
    </MarketingSection>
  );
}
