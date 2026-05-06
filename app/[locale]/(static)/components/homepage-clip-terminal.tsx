"use client";

import type { ClipTerminal } from "@/core/fumadocs/schemas/homepage";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 10_000;

const BEATS = {
  paste: [0, 0.2],
  prompt: [0.2, 0.35],
  tool: [0.35, 0.5],
  result: [0.5, 0.7],
  follow: [0.7, 0.85],
  done: [0.85, 1],
} as const;

const BEAT_KEYS = Object.keys(BEATS) as Array<keyof typeof BEATS>;

const TOOL_CALL = "customermates.deals.list({ idle_gt: 14 })";

const DEALS = [
  { org: "Pinecraft", val: "€4,800", days: 21 },
  { org: "Fold", val: "€18,000", days: 18 },
  { org: "Orbit", val: "€9,200", days: 16 },
];

const CONFIG_LINES = [
  "claude mcp add --transport http customermates \\",
  "  https://customermates.com/api/v1/mcp \\",
  '  --header "x-api-key: cm_live_a7f3b2c9…"',
].join("\n");

function useClipClock(duration: number) {
  const [t, setT] = useState(0);

  useEffect(() => {
    let raf = 0;
    let start: number | null = null;

    const loop = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = (ts - start) % duration;
      setT(elapsed / duration);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  return t;
}

function stream(text: string, t: number, window: readonly [number, number]) {
  const [a, b] = window;
  if (t < a) return { visible: "", cursor: false, done: false };
  if (t >= b) return { visible: text, cursor: false, done: true };
  const p = (t - a) / (b - a);
  const n = Math.floor(text.length * p);
  return { visible: text.substring(0, n), cursor: true, done: false };
}

function phaseIndex(t: number) {
  for (let i = 0; i < BEAT_KEYS.length; i++) {
    const [a, b] = BEATS[BEAT_KEYS[i]];
    if (t >= a && t < b) return i;
  }
  return BEAT_KEYS.length - 1;
}

function cursorOpacity(t: number) {
  return (t * 15) % 1 < 0.5 ? 1 : 0.15;
}

function Equalizer({ t, count = 14 }: { t: number; count?: number }) {
  return (
    <span className="inline-flex h-[14px] items-center gap-[3px]">
      {Array.from({ length: count }).map((_, i) => {
        const phase = (t * 12 + i * 0.18) % 1;
        const h = 3 + Math.abs(Math.sin(phase * Math.PI * 2)) * 11;
        const opacity = 0.3 + 0.65 * Math.abs(Math.sin(phase * Math.PI));
        return (
          <span key={i} className="inline-block rounded-[2px] bg-primary" style={{ width: 2.5, height: h, opacity }} />
        );
      })}
    </span>
  );
}

export function HomepageClipTerminal({ strings }: { strings: ClipTerminal }) {
  const t = useClipClock(DURATION_MS);
  const scrollRef = useRef<HTMLDivElement>(null);

  const linesEnd = BEATS.paste[0] + 0.14;
  const pasted = stream(CONFIG_LINES, t, [BEATS.paste[0] + 0.005, linesEnd]);
  const connected = t > linesEnd + 0.02;

  const promptText = stream(strings.prompt, t, BEATS.prompt);
  const toolText = stream(TOOL_CALL, t, [BEATS.tool[0], BEATS.tool[0] + 0.07]);
  const showResult = t >= BEATS.result[0] - 0.01;
  const followQ = stream(strings.followQ, t, [BEATS.follow[0], BEATS.follow[0] + 0.06]);
  const followOk = stream(strings.followOk, t, [BEATS.follow[0] + 0.065, BEATS.follow[0] + 0.14]);
  const doneShow = t >= BEATS.done[0];

  const activeBeat = phaseIndex(t);
  const cursor = cursorOpacity(t);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [t]);

  return (
    <div className="relative aspect-16/10 w-full overflow-hidden rounded-xl border border-white/5 bg-[#0a0a0f] font-mono text-[10px] leading-[1.55] text-[#d4d4d8] shadow-[0_24px_60px_-22px_rgba(0,0,0,0.55)] sm:text-[12px] md:text-[13px]">
      <div className="flex h-[26px] items-center gap-1.5 border-b border-white/5 bg-[#0f0f14] px-3">
        <span className="size-2 rounded-full bg-[#ff5f56]" />

        <span className="size-2 rounded-full bg-[#ffbd2e]" />

        <span className="size-2 rounded-full bg-[#27c93f]" />

        <span className="flex-1 text-center text-[10px] text-[#555]">~/agent</span>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[26px] opacity-30 bg-[linear-gradient(rgba(94,74,227,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(94,74,227,0.06)_1px,transparent_1px)] bg-size-[22px_22px]"
      />

      <div
        ref={scrollRef}
        className="relative box-border h-[calc(100%-26px)] overflow-y-hidden p-3 sm:px-5 sm:py-4"
        style={{ scrollBehavior: "smooth" }}
      >
        <div className="mb-2.5 whitespace-pre-wrap text-[#a78bfa]">
          {pasted.visible}

          {pasted.cursor && <span style={{ opacity: cursor }}>▍</span>}
        </div>

        {/* eslint-disable react/jsx-newline */}
        {connected && (
          <div className="mb-4 flex items-center gap-1.5 text-[12px] text-[#34c759]">
            <span className="size-1.5 rounded-full bg-[#34c759]" style={{ boxShadow: "0 0 8px #34c759" }} />
            {strings.connected}
          </div>
        )}

        {t >= BEATS.prompt[0] - 0.005 && (
          <div className="mb-2.5 text-white">
            <span className="text-primary">›</span> {promptText.visible}
            {promptText.cursor && <span style={{ opacity: cursor }}>▍</span>}
          </div>
        )}

        {t >= BEATS.tool[0] - 0.005 && (
          <div className="mb-1 text-[12px] text-[#656567]">
            <span className="text-[#444]">⎯⎯</span> <span className="text-[#888]">tool</span>{" "}
            <span className="text-[#c4b5fd]">{toolText.visible}</span>
            {toolText.cursor && (
              <span className="text-[#c4b5fd]" style={{ opacity: cursor }}>
                ▍
              </span>
            )}
          </div>
        )}

        {t >= BEATS.tool[0] + 0.06 && t < BEATS.result[0] && (
          <div className="mb-3 pl-4">
            <Equalizer count={14} t={t} />
          </div>
        )}

        {showResult && (
          <div className="mb-3 text-[12px]">
            <div className="mb-1 text-[#888]">{strings.resultSummary}</div>

            <div className="grid grid-cols-[1fr_0.7fr_0.5fr] gap-x-4 gap-y-0.5 text-[#d4d4d8]">
              {DEALS.map((d) => (
                <span key={d.org} className="contents">
                  <span>· {d.org}</span>

                  <span className="text-[#a78bfa]">{d.val}</span>

                  <span className="text-[#ff9500]">{d.days}d</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {t >= BEATS.follow[0] - 0.005 && (
          <div className="mb-1 text-[12px] text-[#656567]">
            <span className="text-[#129490]">◆</span> {followQ.visible}
            {followQ.cursor && <span style={{ opacity: cursor }}>▍</span>}
          </div>
        )}

        {t >= BEATS.follow[0] + 0.06 && (
          <div className="mb-2.5 text-[12px] text-white">
            <span className="text-primary">›</span> {followOk.visible}
            {followOk.cursor && <span style={{ opacity: cursor }}>▍</span>}
          </div>
        )}
        {/* eslint-enable react/jsx-newline */}

        {doneShow && <div className="text-[12px] text-[#34c759]">{strings.done}</div>}
      </div>

      <div className="pointer-events-none absolute bottom-3.5 right-3.5 flex gap-[3px]">
        {BEAT_KEYS.map((_, i) => (
          <span
            key={i}
            className="inline-block h-[3px] rounded-full transition-[width] duration-300"
            style={{
              width: i <= activeBeat ? 14 : 4,
              background: i <= activeBeat ? "#5e4ae3" : "rgba(255,255,255,0.18)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
