import type { Hero } from "@/core/fumadocs/schemas/common";

import { HubPostCard, type HubPostCardProps } from "./hub-post-card";
import { PostGridShell } from "./post-grid-shell";

export type HubPostGridItem = Omit<HubPostCardProps, "locale">;

type Props = {
  hero: Hero;
  items: HubPostGridItem[];
  locale: string;
};

export function HubPostGrid({ hero, items, locale }: Props) {
  return (
    <PostGridShell hero={hero}>
      {items.map((item) => (
        <div key={item.href} className="min-w-0">
          <HubPostCard {...item} locale={locale} />
        </div>
      ))}
    </PostGridShell>
  );
}
