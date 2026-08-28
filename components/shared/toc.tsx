"use client";

import type { TOCItemType } from "fumadocs-core/toc";
import type { ReactNode } from "react";
import * as TocClerk from "fumadocs-ui/components/toc/clerk";
import * as FumaToc from "fumadocs-ui/components/toc/index";

import { cn } from "@/core/utils/cn";

type Props = {
  actions?: ReactNode;
  children: ReactNode;
  items: TOCItemType[];
  layout?: "article" | "default";
};

export function Toc({ items, children, actions, layout = "default" }: Props) {
  return (
    <FumaToc.TOCProvider toc={items}>
      <div
        className={
          layout === "article"
            ? "text-sm lg:grid lg:grid-cols-[minmax(0,72ch)_14rem] lg:justify-center lg:gap-10"
            : "flex gap-6"
        }
      >
        <div
          className={cn("min-w-0 [&_[id]]:scroll-mt-[var(--toc-anchor-offset,0px)]", layout === "default" && "flex-1")}
        >
          {children}
        </div>

        <aside
          className={cn(
            "sticky top-[var(--toc-sticky-top,0px)] hidden max-h-[calc(100svh-var(--toc-sticky-top,0px))] min-h-0 shrink-0 self-start lg:flex lg:flex-col",
            layout === "article" ? "lg:w-56" : "max-w-68",
          )}
        >
          {actions ? <div className="shrink-0 pt-3 pb-1">{actions}</div> : null}

          <FumaToc.TOCScrollArea className="min-h-0 flex-1 [&_a]:text-xs">
            <TocClerk.TOCItems />
          </FumaToc.TOCScrollArea>
        </aside>
      </div>
    </FumaToc.TOCProvider>
  );
}
