"use client";

import type { HomepageStageTab } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { preconnect } from "react-dom";
import { Inbox, KanbanSquare, LayoutDashboard, Repeat, UserRound } from "lucide-react";

import { cn } from "@/core/utils/cn";

import { HomepageCaptureImage } from "./homepage-capture-image";
import { ProductWindow } from "./homepage-product-window";
import { useHomepageMotion } from "./homepage-motion";
import {
  type HomepageStageArea,
  PRODUCT_DEMO_ANCHOR,
  STAGE_AREAS,
  STAGE_OPEN_EVENT,
  stageAreaFromHash,
} from "./homepage-stage-areas";

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

const STAGE_DEMO_PATHS = {
  customers: "/contacts",
  dashboard: "/dashboard",
  inbox: "/inbox",
  pipeline: "/deals",
  routines: "/routines",
} as const satisfies Record<HomepageStageArea, string>;

const LIVE_STAGE_MEDIA = "(min-width: 40rem)";

export const LIVE_REVEAL_DELAY_MS = 900;

const STAGE_MAX_TILT_DEG = 12;

const STAGE_MIN_SCALE = 0.94;

type Props = {
  demoBaseUrl: string;
  disclosure: string;
  label: string;
  live: { badge: string; prompt: string; status: string };
  locale: ContentLocale;
  tabs: HomepageStageTab[];
};

export function HomepageProductStage({ demoBaseUrl, disclosure, label, live: liveCopy, locale, tabs }: Props) {
  const { isInView, ref, shouldAnimate, shouldReduceMotion } = useHomepageMotion<HTMLDivElement>();
  const frameRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();
  const [live, setLive] = useState(false);
  const [liveLoadedSrc, setLiveLoadedSrc] = useState<string | null>(null);
  const revealTimer = useRef(0);
  const activeTab = tabs[activeIndex];
  const liveSrc = `${demoBaseUrl}/${locale}${STAGE_DEMO_PATHS[STAGE_AREAS[activeTab.capture]]}?agentChat=closed`;
  const liveReady = live && liveLoadedSrc === liveSrc;
  const autoAdvance = shouldAnimate && !stopped && !hovered && !live;

  preconnect(demoBaseUrl);

  useEffect(() => {
    if (!isInView || !window.matchMedia?.(LIVE_STAGE_MEDIA).matches) return;

    setStopped(true);
    setLive(true);
  }, [isInView]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || shouldReduceMotion) return;

    const scroller = frame.closest("[data-public-scrollport]") ?? window;
    let pending = 0;

    function update() {
      pending = 0;
      if (!frame) return;

      const viewport = window.innerHeight || 1;
      const progress = Math.min(
        1,
        Math.max(0, (viewport * 0.9 - frame.getBoundingClientRect().top) / (viewport * 0.55)),
      );

      frame.style.setProperty("--stage-tilt", `${((1 - progress) * STAGE_MAX_TILT_DEG).toFixed(2)}deg`);
      frame.style.setProperty("--stage-scale", (STAGE_MIN_SCALE + (1 - STAGE_MIN_SCALE) * progress).toFixed(4));
    }

    function schedule() {
      if (!pending) pending = window.requestAnimationFrame(update);
    }

    update();
    scroller.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      window.cancelAnimationFrame(pending);
      scroller.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [shouldReduceMotion]);

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

  useEffect(() => {
    function openArea(area: HomepageStageArea | null) {
      const index = area ? tabs.findIndex((tab) => STAGE_AREAS[tab.capture] === area) : -1;

      setStopped(true);
      if (index >= 0) setActiveIndex(index);
      if (window.matchMedia?.(LIVE_STAGE_MEDIA).matches) setLive(true);
    }

    function openFromHash() {
      const area = stageAreaFromHash(window.location.hash);
      if (area !== undefined) openArea(area);
    }

    function openFromEvent(event: Event) {
      openArea((event as CustomEvent<HomepageStageArea>).detail);
    }

    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    window.addEventListener(STAGE_OPEN_EVENT, openFromEvent);

    return () => {
      window.removeEventListener("hashchange", openFromHash);
      window.removeEventListener(STAGE_OPEN_EVENT, openFromEvent);
    };
  }, [tabs]);

  useEffect(() => () => window.clearTimeout(revealTimer.current), []);

  function revealLive(src: string) {
    window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => setLiveLoadedSrc(src), LIVE_REVEAL_DELAY_MS);
  }

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
      className="mt-14 scroll-mt-20 sm:mt-16 lg:mt-20"
      data-homepage-section="product-stage"
      id={PRODUCT_DEMO_ANCHOR}
      onFocus={() => setStopped(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative [perspective:2400px]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/3 -bottom-20 -z-10 bg-[radial-gradient(45%_55%_at_50%_100%,color-mix(in_oklab,var(--color-primary)_30%,transparent),transparent)] blur-2xl"
        />

        <div
          ref={frameRef}
          data-homepage-stage-frame
          className="relative mx-auto max-w-[19rem] origin-[50%_0%] transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none sm:max-w-none lg:[transform:rotateX(var(--stage-tilt,0deg))_scale(var(--stage-scale,1))]"
          data-homepage-stage-live={liveReady ? "ready" : live ? "loading" : "idle"}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[12%] top-0 z-20 h-px bg-linear-to-r from-transparent via-white/40 to-transparent max-sm:hidden"
          />

          <ProductWindow
            chromeClassName="max-sm:hidden"
            className="rounded-[1.75rem] sm:rounded-xl"
            label={activeTab.label}
            status={
              liveReady ? (
                <>
                  <span aria-hidden className="size-1.5 rounded-full bg-success" />

                  {liveCopy.badge}
                </>
              ) : null
            }
          >
            <div className="relative">
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

              {live ? (
                <iframe
                  className={cn(
                    "absolute inset-0 z-10 size-full border-0 bg-background transition-opacity duration-300 motion-reduce:transition-none",
                    liveReady ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                  referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  src={liveSrc}
                  title={`${liveCopy.prompt}: ${activeTab.label}`}
                  onLoad={() => revealLive(liveSrc)}
                />
              ) : null}
            </div>
          </ProductWindow>
        </div>
      </div>

      <div
        ref={listRef}
        aria-label={label}
        className="relative z-10 mx-auto mt-8 flex w-fit max-w-full snap-x gap-1 overflow-x-auto rounded-full border border-foreground/10 bg-foreground/[0.03] p-1 backdrop-blur-sm [scrollbar-width:none]"
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
                "relative inline-flex shrink-0 snap-start items-center gap-2 overflow-hidden rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                isActive && "bg-background text-foreground shadow-sm ring-1 ring-foreground/10",
              )}
              data-homepage-stage-tab={tab.capture}
              id={`${baseId}-tab-${index}`}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              type="button"
              onClick={() => select(index)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              <span aria-hidden className="absolute inset-x-3 bottom-0 h-px overflow-hidden">
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
                    <span className="block h-full" data-homepage-stage-progress="static" />
                  )
                ) : null}
              </span>

              <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />

              {tab.label}
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-center text-sm text-muted-foreground">{activeTab.caption}</p>

      <p className="text-meta mt-1.5 flex items-center justify-center gap-2 text-center text-xs">
        {liveReady ? (
          <>
            <span
              aria-hidden
              className="size-1.5 shrink-0 animate-pulse rounded-full bg-success motion-reduce:animate-none"
            />

            {liveCopy.status}
          </>
        ) : (
          disclosure
        )}
      </p>
    </div>
  );
}
