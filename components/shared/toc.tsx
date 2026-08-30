"use client";

import type { TOCItemType } from "fumadocs-core/toc";
import type { ReactNode } from "react";
import * as TocClerk from "fumadocs-ui/components/toc/clerk";
import * as FumaToc from "fumadocs-ui/components/toc/index";

import { cn } from "@/core/utils/cn";

type Props = {
  actions?: ReactNode;
  asideFooter?: ReactNode;
  children: ReactNode;
  items: TOCItemType[];
  layout?: "article" | "default";
};

export function Toc({ items, children, actions, asideFooter, layout = "default" }: Props) {
  const hasMobileFooter = layout === "article" && Boolean(asideFooter);

  return (
    <FumaToc.TOCProvider toc={items}>
      <div
        className={
          layout === "article"
            ? "text-sm lg:grid lg:grid-cols-[minmax(0,96ch)_15rem] lg:justify-center lg:gap-6"
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
            "top-[var(--toc-sticky-top,0px)] min-h-0 shrink-0 self-start lg:flex lg:max-h-[calc(100svh-var(--toc-sticky-top,0px))] lg:flex-col",
            hasMobileFooter ? "static mt-10 flex flex-col lg:sticky lg:mt-0" : "sticky hidden",
            layout === "article" ? "lg:w-60" : "max-w-68",
          )}
        >
          {actions ? <div className="shrink-0 pt-3 pb-1">{actions}</div> : null}

          <FumaToc.TOCScrollArea className={cn("min-h-0 flex-1 [&_a]:text-xs", hasMobileFooter && "hidden lg:block")}>
            <TocClerk.TOCItems />
          </FumaToc.TOCScrollArea>

          {asideFooter ? (
            <div className={cn("shrink-0", hasMobileFooter ? "lg:pt-4" : "pt-4")}>{asideFooter}</div>
          ) : null}
        </aside>
      </div>
    </FumaToc.TOCProvider>
  );
}
