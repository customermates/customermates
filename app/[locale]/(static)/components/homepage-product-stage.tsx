"use client";

import type { HomepageStageTab } from "@/core/fumadocs/schemas/homepage";
import type { ContentLocale } from "@/i18n/locale-registry";

import { type FocusEvent, type KeyboardEvent, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { preconnect } from "react-dom";
import { Inbox, KanbanSquare, LayoutDashboard, Repeat, Settings2, UserRound } from "lucide-react";

import { cn } from "@/core/utils/cn";

import { HomepageCaptureImage } from "./homepage-capture-image";
import { DEMO_RECORD_LIST_PATHS, DEMO_RECORD_TYPE_IDS } from "@/components/marketing/product-demo";
import { ProductWindow } from "@/components/marketing/product-window";
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
  "homepage-configure": Settings2,
  "homepage-dashboard": LayoutDashboard,
  "homepage-inbox": Inbox,
  "homepage-pipeline": KanbanSquare,
  "homepage-record": UserRound,
  "homepage-routines": Repeat,
} as const;

const MOBILE_CAPTURES = {
  "homepage-configure": "homepage-configure-mobile",
  "homepage-dashboard": "homepage-dashboard-mobile",
  "homepage-inbox": "homepage-inbox-mobile",
  "homepage-pipeline": "homepage-pipeline-mobile",
  "homepage-record": "homepage-record-mobile",
  "homepage-routines": "homepage-routines-mobile",
} as const;

const STAGE_DEMO_PATHS = {
  customers: DEMO_RECORD_LIST_PATHS.contacts,
  dashboard: "/dashboard",
  "data-model": `/configure?focus=list:${DEMO_RECORD_TYPE_IDS.deals}`,
  inbox: "/inbox?threadId=latest",
  pipeline: DEMO_RECORD_LIST_PATHS.deals,
  routines: "/routines",
} as const satisfies Record<HomepageStageArea, string>;

const LIVE_STAGE_MEDIA = "(min-width: 40rem)";

function subscribeToLiveStageMedia(onChange: () => void) {
  const media = window.matchMedia?.(LIVE_STAGE_MEDIA);
  media?.addEventListener?.("change", onChange);
  return () => media?.removeEventListener?.("change", onChange);
}

function getLiveStageMediaSnapshot() {
  return window.matchMedia?.(LIVE_STAGE_MEDIA).matches ?? false;
}

function getServerLiveStageMediaSnapshot() {
  return false;
}

export const LIVE_REVEAL_DELAY_MS = 500;

const LIVE_VIEWPORT = { height: 900, width: 1440 } as const;

const STAGE_MAX_TILT_DEG = 12;

const STAGE_MIN_SCALE = 0.94;

type Props = {
  demoBaseUrl: string;
  label: string;
  live: { prompt: string };
  locale: ContentLocale;
  tabs: HomepageStageTab[];
};

function StageProgressRing() {
  return (
    <svg aria-hidden className="size-4 shrink-0 -rotate-90" data-homepage-stage-progress="running" viewBox="0 0 16 16">
      <circle cx="8" cy="8" fill="none" r="6" stroke="currentColor" strokeOpacity={0.2} strokeWidth="2" />

      <motion.circle
        animate={{ pathLength: 1 }}
        cx="8"
        cy="8"
        fill="none"
        initial={{ pathLength: 0 }}
        r="6"
        stroke="var(--primary)"
        strokeLinecap="round"
        strokeWidth="2"
        transition={{ duration: PRODUCT_STAGE_INTERVAL_MS / 1000, ease: "linear" }}
      />
    </svg>
  );
}

export function HomepageProductStage({ demoBaseUrl, label, live: liveCopy, locale, tabs }: Props) {
  const { ref, shouldAnimate, shouldReduceMotion } = useHomepageMotion<HTMLDivElement>();
  const frameRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [loadedTabs, setLoadedTabs] = useState<ReadonlySet<number>>(() => new Set([0, 1]));
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();
  const [liveRequested, setLive] = useState(false);
  const liveAllowed = useSyncExternalStore(
    subscribeToLiveStageMedia,
    getLiveStageMediaSnapshot,
    getServerLiveStageMediaSnapshot,
  );
  const live = liveRequested && liveAllowed;
  const [liveMounted, setLiveMounted] = useState<ReadonlySet<number>>(() => new Set());
  const [liveShown, setLiveShown] = useState<ReadonlySet<number>>(() => new Set());
  const revealTimers = useRef(new Map<number, number>());
  const liveBoxRef = useRef<HTMLDivElement>(null);
  const [liveScale, setLiveScale] = useState(1);
  const activeTab = tabs[activeIndex];
  const liveReady = live && liveShown.has(activeIndex);
  const autoAdvance = shouldAnimate && !stopped && !hovered;

  preconnect(demoBaseUrl);

  useEffect(() => {
    if (liveAllowed) setLive(true);
  }, [liveAllowed]);

  useEffect(() => {
    if (!live) return;

    setLiveMounted((current) => (current.has(activeIndex) ? current : new Set([...current, activeIndex])));
  }, [activeIndex, live]);

  useEffect(() => {
    if (!live || !liveShown.has(activeIndex)) return;

    const upcoming = (activeIndex + 1) % tabs.length;
    setLiveMounted((current) => (current.has(upcoming) ? current : new Set([...current, upcoming])));
  }, [activeIndex, live, liveShown, tabs.length]);

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

  useEffect(() => {
    const timers = revealTimers.current;

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const box = liveBoxRef.current;
    if (!box || !live || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => setLiveScale(entry.contentRect.width / LIVE_VIEWPORT.width));
    observer.observe(box);

    return () => observer.disconnect();
  }, [live]);

  function liveSrcFor(tab: HomepageStageTab) {
    const path: string = STAGE_DEMO_PATHS[STAGE_AREAS[tab.capture]];

    return `${demoBaseUrl}/${locale}${path}${path.includes("?") ? "&" : "?"}agentChat=closed`;
  }

  function revealLive(index: number) {
    window.clearTimeout(revealTimers.current.get(index));
    revealTimers.current.set(
      index,
      window.setTimeout(
        () => setLiveShown((current) => (current.has(index) ? current : new Set([...current, index]))),
        LIVE_REVEAL_DELAY_MS,
      ),
    );
  }

  function stopOnVisitorFocus(event: FocusEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLIFrameElement && !hovered) return;

    setStopped(true);
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
      onFocus={stopOnVisitorFocus}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative [perspective:2400px]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/3 -bottom-20 -z-10 bg-[radial-gradient(40%_45%_at_50%_100%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)] blur-2xl"
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

          <ProductWindow className="max-sm:rounded-[1.6rem]">
            <div ref={liveBoxRef} className="relative">
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

              {tabs.map((tab, index) =>
                live && liveMounted.has(index) ? (
                  <iframe
                    key={tab.capture}
                    className={cn(
                      "absolute top-0 left-0 z-10 origin-top-left border-0 bg-sidebar transition-opacity duration-500 ease-out motion-reduce:transition-none",
                      index === activeIndex && liveShown.has(index) ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                    data-homepage-stage-iframe={index === activeIndex ? "active" : "standby"}
                    inert={index !== activeIndex}
                    referrerPolicy="strict-origin-when-cross-origin"
                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                    src={liveSrcFor(tab)}
                    style={{
                      height: LIVE_VIEWPORT.height,
                      transform: `scale(${liveScale})`,
                      width: LIVE_VIEWPORT.width,
                    }}
                    tabIndex={index === activeIndex ? 0 : -1}
                    title={`${liveCopy.prompt}: ${tab.label}`}
                    onLoad={() => revealLive(index)}
                  />
                ) : null,
              )}
            </div>
          </ProductWindow>
        </div>
      </div>

      <div
        ref={listRef}
        aria-label={label}
        className="glass-surface relative z-10 mx-auto mt-8 flex w-fit max-w-full snap-x gap-0.5 overflow-x-auto rounded-full p-1 [scrollbar-width:none]"
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
                "relative isolate inline-flex shrink-0 snap-start items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-300 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
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
              {isActive ? (
                <motion.span
                  aria-hidden
                  className="mark-glow absolute inset-0 -z-10 rounded-full [--tint:color-mix(in_oklab,var(--primary)_32%,transparent)]"
                  data-homepage-stage-progress={autoAdvance && !shouldReduceMotion ? undefined : "static"}
                  layoutId={`${baseId}-thumb`}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}

              {isActive && autoAdvance && !shouldReduceMotion ? (
                <StageProgressRing key={`progress-${activeIndex}`} />
              ) : (
                <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
              )}

              {tab.label}
            </button>
          );
        })}
      </div>

      <motion.p
        key={activeTab.capture}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 text-center text-sm text-muted-foreground"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {activeTab.caption}
      </motion.p>
    </div>
  );
}
