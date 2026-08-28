"use client";

import type { TOCItemType } from "fumadocs-core/toc";
import type { ReactNode } from "react";
import * as TocClerk from "fumadocs-ui/components/toc/clerk";
import * as FumaToc from "fumadocs-ui/components/toc/index";

export function Toc({ items, children, actions }: { items: TOCItemType[]; children: ReactNode; actions?: ReactNode }) {
  return (
    <FumaToc.TOCProvider toc={items}>
      <div className="flex gap-6">
        <div className="min-w-0 flex-1 [&_[id]]:scroll-mt-[var(--toc-anchor-offset,0px)]">{children}</div>

        <aside className="sticky top-[var(--toc-sticky-top,0px)] hidden max-h-[calc(100svh-var(--toc-sticky-top,0px))] min-h-0 max-w-68 shrink-0 self-start lg:flex lg:flex-col">
          {actions ? <div className="shrink-0 pt-3 pb-1">{actions}</div> : null}

          <FumaToc.TOCScrollArea className="min-h-0 flex-1 [&_a]:text-xs">
            <TocClerk.TOCItems />
          </FumaToc.TOCScrollArea>
        </aside>
      </div>
    </FumaToc.TOCProvider>
  );
}
