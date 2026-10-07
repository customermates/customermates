"use client";

import type { HomepageStageTab } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Inbox, KanbanSquare, LayoutDashboard, Repeat, UserRound } from "lucide-react";

import { cn } from "@/core/utils/cn";

import { HomepageCaptureImage } from "./homepage-capture-image";
import { useHomepageMotion } from "./homepage-motion";

export const PRODUCT_STAGE_INTERVAL_MS = 6_000;

const TAB_ICONS = {
  "homepage-dashboard": LayoutDashboard,
  "homepage-inbox": Inbox,
  "homepage-pipeline": KanbanSquare,
  "homepage-record": UserRound,
  "homepage-routines": Repeat,
} as const;

const MOBILE_CAPTURES = {
  "homepage-dashboard": "homepage-dashboard-mobile",
  "homepage-inbox": "homepage-inbox-mobile",
  "homepage-pipeline": "homepage-pipeline-mobile",
  "homepage-record": "homepage-record-mobile",
  "homepage-routines": "homepage-routines-mobile",
} as const;

type Props = {
  disclosure: string;
  label: string;
  locale: ContentLocale;
  tabs: HomepageStageTab[];
};

export function HomepageProductStage({ disclosure, label, locale, tabs }: Props) {
  const { ref, shouldAnimate, shouldReduceMotion } = useHomepageMotion<HTMLDivElement>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();
  const autoAdvance = shouldAnimate && !stopped && !hovered;

  useEffect(() => {
    if (!autoAdvance) return;

    const timer = window.setTimeout(
      () => setActiveIndex((index) => (index + 1) % tabs.length),
      PRODUCT_STAGE_INTERVAL_MS,
    );

    return () => window.clearTimeout(timer);
  }, [activeIndex, autoAdvance, tabs.length]);

  useEffect(() => {
    const upcoming = (activeIndex + 1) % tabs.length;

    setLoadedTabs((current) =>
      current.has(activeIndex) && current.has(upcoming) ? current : new Set([...current, activeIndex, upcoming]),
    );

    const list = listRef.current;
    const tab = tabRefs.current[activeIndex];

    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;

    list.scrollTo({
      behavior: shouldReduceMotion ? "auto" : "smooth",
      left: tab.offsetLeft - Number.parseFloat(getComputedStyle(list).paddingLeft || "0"),
    });
  }, [activeIndex, shouldReduceMotion, tabs.length]);

  function select(index: number) {
    setStopped(true);
    setActiveIndex(index);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length;

    if (!offset && event.key !== "Home" && event.key !== "End") return;

    event.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div
      ref={ref}
      className="mt-14 sm:mt-16 lg:mt-20"
      data-homepage-section="product-stage"
      onFocus={() => setStopped(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative [perspective:2400px]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[8%] -top-10 bottom-1/3 -z-10 rounded-full bg-primary/20 blur-3xl"
        />

        <div
          data-homepage-stage-frame
          className="relative mx-auto max-w-[19rem] origin-top sm:max-w-none lg:[transform:rotateX(9deg)] lg:[mask-image:linear-gradient(to_bottom,black_78%,transparent)]"
        >
          <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl shadow-black/20 sm:rounded-card">
            {tabs.map((tab, index) => (
              <div
                key={tab.capture}
                aria-labelledby={`${baseId}-tab-${index}`}
                className={cn(
                  "transition-opacity duration-300 ease-out focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                  index === activeIndex ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0",
                )}
                id={`${baseId}-panel-${index}`}
                inert={index !== activeIndex}
                role="tabpanel"
                tabIndex={index === activeIndex ? 0 : -1}
              >
                {index === activeIndex || loadedTabs.has(index) ? (
                  <HomepageCaptureImage
                    alt={tab.alt}
                    eager={index === 0}
                    locale={locale}
                    mobileName={MOBILE_CAPTURES[tab.capture]}
                    mobileSizes="19rem"
                    name={tab.capture}
                    sizes="(min-width: 1280px) 1216px, 92vw"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        ref={listRef}
        aria-label={label}
        className="relative z-10 mx-[calc(var(--marketing-gutter)*-1)] mt-5 flex snap-x scroll-px-[var(--marketing-gutter)] gap-2 overflow-x-auto px-[var(--marketing-gutter)] [scrollbar-width:none] sm:mx-0 sm:mt-6 sm:grid sm:grid-cols-5 sm:gap-4 sm:overflow-visible sm:px-0"
        role="tablist"
        onPointerDown={() => setStopped(true)}
      >
        {tabs.map((tab, index) => {
          const Icon = TAB_ICONS[tab.capture];
          const isActive = index === activeIndex;

          return (
            <button
              key={tab.capture}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              aria-controls={`${baseId}-panel-${index}`}
              aria-selected={isActive}
              className={cn(
                "grid min-w-[9.5rem] shrink-0 snap-start content-start gap-2.5 rounded-lg pb-1 text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:min-w-0",
                isActive && "text-foreground",
              )}
              data-homepage-stage-tab={tab.capture}
              id={`${baseId}-tab-${index}`}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
              onClick={() => select(index)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              <span aria-hidden className="block h-0.5 overflow-hidden rounded-full bg-border">
                {isActive ? (
                  autoAdvance && !shouldReduceMotion ? (
                    <motion.span
                      key={`progress-${activeIndex}`}
                      animate={{ scaleX: 1 }}
                      className="block h-full origin-left bg-primary"
                      data-homepage-stage-progress="running"
                      initial={{ scaleX: 0 }}
                      transition={{ duration: PRODUCT_STAGE_INTERVAL_MS / 1000, ease: "linear" }}
                    />
                  ) : (
                    <span className="block h-full bg-primary" data-homepage-stage-progress="static" />
                  )
                ) : null}
              </span>

              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />

                {tab.label}
              </span>

              <span className="text-xs leading-relaxed text-muted-foreground max-sm:hidden">{tab.caption}</span>
            </button>
          );
        })}
      </div>

      <p className="text-meta mt-4 text-xs sm:mt-5">{disclosure}</p>
    </div>
  );
}
