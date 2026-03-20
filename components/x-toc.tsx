"use client";

import { ScrollProvider, type TOCItemType } from "fumadocs-core/toc";
import { type ReactNode, useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { cn } from "@heroui/theme";
import * as TocClerk from "fumadocs-ui/components/toc/clerk";
import * as Toc from "fumadocs-ui/components/toc/index";

import { useRootStore } from "@/core/stores/root-store.provider";

export const XTOC = observer(({ items, children }: { items: TOCItemType[]; children: ReactNode }) => {
  const { layoutStore } = useRootStore();
  const tocScrollRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!tocScrollRef.current) return;

    let lastActiveElement: Element | null = null;

    const intervalId = setInterval(() => {
      if (!tocScrollRef.current) return;

      const container = tocScrollRef.current;
      const activeElement = container.querySelector('a[data-active="true"]');

      if (activeElement && activeElement !== lastActiveElement) {
        lastActiveElement = activeElement;

        const elementTop = (activeElement as HTMLElement).offsetTop;
        const elementHeight = activeElement.getBoundingClientRect().height;
        const containerHeight = container.getBoundingClientRect().height;

        const targetScroll = elementTop - containerHeight / 2 + elementHeight / 2;

        container.scrollTo({
          top: targetScroll,
          behavior: "smooth",
        });
      } else if (!activeElement) lastActiveElement = null;
    }, 300);

    return () => clearInterval(intervalId);
  }, []);

  return (
    <Toc.TOCProvider toc={items}>
      <div className="flex gap-6">
        <ScrollProvider containerRef={contentScrollRef}>
          <main ref={contentScrollRef} className="flex-1 min-w-0">
            {children}
          </main>
        </ScrollProvider>

        <aside
          ref={tocScrollRef}
          className={cn(
            "hidden lg:block max-w-68 shrink-0 [&_a]:text-xs sticky max-h-screen min-h-0 ms-px overflow-auto py-3 [scrollbar-width:none]",
            layoutStore.isNavbarVisible ? "top-20" : "top-0",
          )}
        >
          <TocClerk.TOCItems />
        </aside>
      </div>
    </Toc.TOCProvider>
  );
});
