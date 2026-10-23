"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { reportApplicationError } from "@/core/errors/report-application-error";

import { useClassifyMediaLoadError } from "./lazy-media";

const BAR_COUNT = 34;

function waveBars(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    bars.push(0.25 + (((h >>> 0) % 1000) / 1000) * 0.75);
  }

  return bars;
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(isFinite(seconds) ? seconds : 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

type Props = {
  src: string;
  durationSeconds?: number | null;
};

export function VoiceMessage({ src, durationSeconds }: Props) {
  const t = useTranslations();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);
  const bars = useMemo(() => waveBars(src), [src]);
  const classifyLoadError = useClassifyMediaLoadError();

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.error) audio.load();
    if (audio.paused) audio.play().catch(() => undefined);
    else audio.pause();
  }, []);

  const effectiveDuration = duration > 0 ? duration : (durationSeconds ?? 0);
  const progress = effectiveDuration > 0 ? Math.min(1, current / effectiveDuration) : 0;

  const seek = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const audio = audioRef.current;
      const dur = audio && isFinite(audio.duration) && audio.duration > 0 ? audio.duration : effectiveDuration;
      if (!audio || !dur) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * dur;
    },
    [effectiveDuration],
  );

  return (
    <div className="flex w-60 max-w-full items-center gap-2.5 px-1 py-0.5">
      <Button
        aria-label={playing ? t("Inbox.voice.pause") : t("Inbox.voice.play")}
        className="rounded-full"
        size="icon"
        type="button"
        variant="default"
        onClick={toggle}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
      </Button>

      <button
        aria-label={t("Inbox.voice.seek")}
        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-between"
        type="button"
        onClick={seek}
      >
        {bars.map((height, index) => (
          <span
            key={index}
            className={cn(
              "w-[3px] shrink-0 rounded-full transition-colors",
              index / BAR_COUNT <= progress ? "bg-primary" : "bg-border-strong",
            )}
            style={{ height: `${Math.round(height * 100)}%` }}
          />
        ))}
      </button>

      <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
        {formatClock(playing || current > 0 ? current : effectiveDuration)}
      </span>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- user voice/audio attachments have no caption track */}
      <audio
        ref={audioRef}
        preload="none"
        src={src}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onError={() => {
          setPlaying(false);
          void classifyLoadError(src)
            .then((kind) => {
              if (kind === "unavailable") {
                toast.error(t("Inbox.mediaUnavailable"), {
                  id: "media-unavailable",
                });
              }
            })
            .catch(reportApplicationError);
        }}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          if (isFinite(value) && value > 0) setDuration(value);
        }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
      />
    </div>
  );
}
