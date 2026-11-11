"use client";

import { useEffect, useRef, useState } from "react";

import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

import { HOMEPAGE_MOTION_VISIBILITY_AMOUNT } from "./homepage-motion";

type Props = {
  ariaLabel: string;
  className?: string;
  playLabel: string;
  durationLabel?: string;
  poster?: string;
  src: string;
};

const AUTOPLAY_VISIBILITY_THRESHOLD = HOMEPAGE_MOTION_VISIBILITY_AMOUNT;

export function HomepageViewportVideo({ ariaLabel, className, durationLabel, playLabel, poster, src }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMeaningfullyVisibleRef = useRef(false);
  const automaticPlaybackRef = useRef(false);
  const resumeWhenVisibleRef = useRef(false);
  const userPausedRef = useRef(false);
  const userUnmutedRef = useRef(false);
  const programmaticActionRef = useRef<"pause" | "play" | null>(null);
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || typeof IntersectionObserver === "undefined") return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    let pageSettled = false;

    const canStartAutomatically = () =>
      pageSettled &&
      !saveData &&
      isMeaningfullyVisibleRef.current &&
      document.visibilityState === "visible" &&
      !reducedMotion.matches &&
      !userPausedRef.current &&
      !userUnmutedRef.current &&
      video.muted &&
      !video.ended;

    const startAutomatically = () => {
      if (!canStartAutomatically() || (!resumeWhenVisibleRef.current && video.currentTime > 0)) return;

      programmaticActionRef.current = "play";
      void video.play().catch(() => {
        programmaticActionRef.current = null;
        automaticPlaybackRef.current = false;
      });
    };

    const pauseOutsideView = () => {
      if (video.paused) return;

      resumeWhenVisibleRef.current =
        automaticPlaybackRef.current && !userPausedRef.current && !userUnmutedRef.current && video.muted;
      programmaticActionRef.current = "pause";
      video.pause();
    };

    const updatePlaybackForVisibility = () => {
      if (isMeaningfullyVisibleRef.current && document.visibilityState === "visible") {
        startAutomatically();
        return;
      }

      pauseOutsideView();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isMeaningfullyVisibleRef.current = Boolean(
          entry?.isIntersecting && entry.intersectionRatio >= AUTOPLAY_VISIBILITY_THRESHOLD,
        );
        updatePlaybackForVisibility();
      },
      { threshold: [0, AUTOPLAY_VISIBILITY_THRESHOLD, 1] },
    );

    const handleReducedMotionChange = () => {
      if (reducedMotion.matches && automaticPlaybackRef.current) {
        resumeWhenVisibleRef.current = false;
        pauseOutsideView();
        return;
      }

      updatePlaybackForVisibility();
    };

    const settle = () => {
      pageSettled = true;
      updatePlaybackForVisibility();
    };
    const idle = (callback: () => void) => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(callback, { timeout: 2000 });
      else setTimeout(callback, 200);
    };
    const onLoad = () => idle(settle);

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    observer.observe(video);
    document.addEventListener("visibilitychange", updatePlaybackForVisibility);
    reducedMotion.addEventListener("change", handleReducedMotionChange);

    return () => {
      window.removeEventListener("load", onLoad);
      observer.disconnect();
      document.removeEventListener("visibilitychange", updatePlaybackForVisibility);
      reducedMotion.removeEventListener("change", handleReducedMotionChange);
    };
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        muted
        playsInline
        aria-hidden={!hasFrame}
        aria-label={ariaLabel}
        className={cn(className, "transition-opacity duration-500", hasFrame ? "opacity-100" : "opacity-0")}
        controls={hasFrame}
        data-autoplay-when-visible="35-percent"
        data-film-ready={hasFrame ? "" : undefined}
        poster={poster}
        preload="none"
        src={src}
        onEnded={() => {
          automaticPlaybackRef.current = false;
          resumeWhenVisibleRef.current = false;
        }}
        onLoadedData={() => setHasFrame(true)}
        onPause={() => {
          if (programmaticActionRef.current === "pause") {
            programmaticActionRef.current = null;
            return;
          }

          userPausedRef.current = true;
          automaticPlaybackRef.current = false;
          resumeWhenVisibleRef.current = false;
        }}
        onPlay={() => {
          if (programmaticActionRef.current === "play") {
            programmaticActionRef.current = null;
            automaticPlaybackRef.current = true;
            userPausedRef.current = false;
            return;
          }

          automaticPlaybackRef.current = false;
          userPausedRef.current = false;
          resumeWhenVisibleRef.current = false;
        }}
        onPlaying={() => setHasFrame(true)}
        onVolumeChange={(event) => {
          if (!event.currentTarget.muted) {
            userUnmutedRef.current = true;
            automaticPlaybackRef.current = false;
            resumeWhenVisibleRef.current = false;
          }
        }}
      />

      {hasFrame ? null : (
        <button
          aria-label={playLabel}
          className="group absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.28),rgba(0,0,0,0.08)_45%,transparent_70%)] p-4"
          data-film-play=""
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = false;
            runUserAction(() => video.play());
          }}
        >
          <span className="flex items-center gap-3 rounded-full bg-gradient-to-r from-[#2563eb] via-[#0891c9] to-[#0f9488] py-2 pr-6 pl-2 text-base font-semibold text-white shadow-[0_12px_40px_rgba(37,99,235,0.45)] ring-1 ring-white/30 transition-transform group-hover:scale-105 sm:py-2.5 sm:pr-7 sm:text-lg">
            <span className="flex size-10 items-center justify-center rounded-full bg-white text-[#2563eb] sm:size-12">
              <svg aria-hidden className="ml-0.5 size-4 sm:size-5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M4 2.5v11a.5.5 0 0 0 .76.43l9-5.5a.5.5 0 0 0 0-.86l-9-5.5A.5.5 0 0 0 4 2.5Z" />
              </svg>
            </span>

            <span>
              {playLabel}

              {durationLabel ? <span className="font-normal text-white/80"> · {durationLabel}</span> : null}
            </span>
          </span>
        </button>
      )}
    </>
  );
}
