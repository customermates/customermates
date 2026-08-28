"use client";

import { useEffect, useRef } from "react";

type Props = {
  ariaLabel: string;
  className?: string;
  src: string;
};

const AUTOPLAY_VISIBILITY_THRESHOLD = 0.55;

export function HomepageViewportVideo({ ariaLabel, className, src }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMeaningfullyVisibleRef = useRef(false);
  const automaticPlaybackRef = useRef(false);
  const resumeWhenVisibleRef = useRef(false);
  const userPausedRef = useRef(false);
  const userUnmutedRef = useRef(false);
  const programmaticActionRef = useRef<"pause" | "play" | null>(null);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || typeof IntersectionObserver === "undefined") return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const canStartAutomatically = () =>
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

    observer.observe(video);
    document.addEventListener("visibilitychange", updatePlaybackForVisibility);
    reducedMotion.addEventListener("change", handleReducedMotionChange);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updatePlaybackForVisibility);
      reducedMotion.removeEventListener("change", handleReducedMotionChange);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      controls
      muted
      playsInline
      aria-label={ariaLabel}
      className={className}
      data-autoplay-when-visible="55-percent"
      preload="metadata"
      src={src}
      onEnded={() => {
        automaticPlaybackRef.current = false;
        resumeWhenVisibleRef.current = false;
      }}
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
      onVolumeChange={(event) => {
        if (!event.currentTarget.muted) {
          userUnmutedRef.current = true;
          automaticPlaybackRef.current = false;
          resumeWhenVisibleRef.current = false;
        }
      }}
    />
  );
}
