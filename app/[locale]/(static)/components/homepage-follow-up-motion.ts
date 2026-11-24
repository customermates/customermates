import type { CSSProperties } from "react";

export const FOLLOW_UP_LOOP = 12;
const END = 11.2;

const pct = (t: number) => `${Math.min(100, Math.max(0, (t / FOLLOW_UP_LOOP) * 100)).toFixed(2)}%`;
const tenth = (t: number) => Math.round(t * 10);

export function at(t: number): CSSProperties {
  return { animationName: `hfu-in-${tenth(t)}` };
}

function keyframesIn(t: number): string {
  const enter = Math.min(t + 0.45, END - 0.2);
  return `@keyframes hfu-in-${tenth(t)} { 0%, ${pct(t)} { opacity: 0; transform: translateY(0.375rem); } ${pct(enter)}, ${pct(END)} { opacity: 1; transform: none; } ${pct(END + 0.45)}, 100% { opacity: 0; transform: none; } }`;
}

function windowKeyframes(name: string, a: number, b: number): string {
  const gone = b >= END ? END + 0.45 : b + 0.2;
  return `@keyframes ${name} { 0%, ${pct(a)} { opacity: 0; } ${pct(a + 0.3)}, ${pct(b)} { opacity: 1; } ${pct(gone)}, 100% { opacity: 0; } }`;
}

const D0 = "transform: none; filter: none;";
const D1 = "transform: translateY(0.625rem) scale(0.96); filter: brightness(0.9);";
const D2 = "transform: translateY(1.25rem) scale(0.92); filter: brightness(0.8);";
const DROP = "transform: translateY(-2.5rem); filter: none;";
const OUT_R = "transform: translateX(130%) rotate(10deg); filter: none;";
const OUT_L = "transform: translateX(-130%) rotate(-10deg); filter: none;";
const NUDGE_R = "transform: translateX(1.75rem) rotate(2.5deg); filter: none;";
const NUDGE_L = "transform: translateX(-1.75rem) rotate(-2.5deg); filter: none;";

export const FOLLOW_UP_ANIM = {
  count: ["hfu-c1", "hfu-c2", "hfu-c3", "hfu-c4"],
  hintLeft: "hfu-h2",
  hintRight: "hfu-h1",
  later: "hfu-later",
  laterStamp: "hfu-later-stamp",
  next: "hfu-next",
  sent: "hfu-sent",
  sentStamp: "hfu-sent-stamp",
} as const;

const DECK = `
@keyframes hfu-sent { 0%, ${pct(6.4)} { opacity: 0; ${DROP} } ${pct(6.9)}, ${pct(7.7)} { opacity: 1; ${D0} } ${pct(8.1)} { opacity: 1; ${NUDGE_R} } ${pct(8.6)}, 100% { opacity: 0; ${OUT_R} } }
@keyframes hfu-later { 0%, ${pct(5.8)} { opacity: 0; ${D0} } ${pct(6.1)}, ${pct(6.4)} { opacity: 1; ${D0} } ${pct(6.9)}, ${pct(8.3)} { opacity: 1; ${D1} } ${pct(8.8)}, ${pct(9.4)} { opacity: 1; ${D0} } ${pct(9.8)} { opacity: 1; ${NUDGE_L} } ${pct(10.4)}, 100% { opacity: 0; ${OUT_L} } }
@keyframes hfu-next { 0%, ${pct(5.8)} { opacity: 0; ${D1} } ${pct(6.1)}, ${pct(6.4)} { opacity: 1; ${D1} } ${pct(6.9)}, ${pct(8.3)} { opacity: 1; ${D2} } ${pct(8.8)}, ${pct(10.2)} { opacity: 1; ${D1} } ${pct(10.7)}, ${pct(END)} { opacity: 1; ${D0} } ${pct(END + 0.45)}, 100% { opacity: 0; ${D0} } }
@keyframes hfu-sent-stamp { 0%, ${pct(7.85)} { opacity: 0; } ${pct(8.05)}, ${pct(8.45)} { opacity: 1; } ${pct(8.6)}, 100% { opacity: 0; } }
@keyframes hfu-later-stamp { 0%, ${pct(9.55)} { opacity: 0; } ${pct(9.75)}, ${pct(10.25)} { opacity: 1; } ${pct(10.4)}, 100% { opacity: 0; } }
${windowKeyframes("hfu-h1", 7.5, 8.6)}
${windowKeyframes("hfu-h2", 9.2, 10.4)}
${windowKeyframes("hfu-c1", 5.7, 6.4)}
${windowKeyframes("hfu-c2", 6.4, 8.6)}
${windowKeyframes("hfu-c3", 8.6, 10.4)}
${windowKeyframes("hfu-c4", 10.4, END)}
`;

const ENTRANCES = Array.from({ length: tenth(END) }, (_, index) => keyframesIn(index / 10)).join("\n");

export const FOLLOW_UP_CSS = `
.hfu-node { border-radius: 0.875rem; padding: 0.75rem 0.875rem; background: var(--card); text-align: left;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 12%, transparent); }
.hfu-node-kind { display: flex; align-items: center; gap: 0.375rem; font-size: 0.6875rem; font-weight: 500; color: var(--muted-foreground); }
.hfu-node-kind .hfu-tag { margin-left: auto; border-radius: 0.375rem; padding: 0.0625rem 0.375rem; font-size: 0.625rem; color: var(--foreground);
  background: color-mix(in oklab, var(--foreground) 8%, transparent); }
.hfu-node-text { margin-top: 0.375rem; font-size: 0.8125rem; line-height: 1.25rem; color: var(--foreground); }
.hfu-link { width: 1px; height: 1.25rem; margin: 0 auto;
  background-image: linear-gradient(color-mix(in oklab, var(--foreground) 30%, transparent) 50%, transparent 0); background-size: 1px 6px; }
.hfu-toggle { position: relative; display: inline-flex; align-items: center; gap: 0.375rem; min-width: 4.25rem; white-space: nowrap; font-size: 0.6875rem; font-weight: 500; color: var(--muted-foreground); }
.hfu-toggle i { position: relative; flex-shrink: 0; width: 1.5rem; height: 0.875rem; border-radius: 999px; background: color-mix(in oklab, var(--foreground) 18%, transparent); }
.hfu-toggle i::after { content: ""; position: absolute; top: 0.125rem; left: 0.125rem; width: 0.625rem; height: 0.625rem; border-radius: 999px; background: var(--card); }
.hfu-toggle-on { position: absolute; inset: 0; color: var(--foreground); background: var(--card); }
.hfu-toggle-on i { background: var(--foreground); }
.hfu-toggle-on i::after { left: auto; right: 0.125rem; }
.hfu-deck { position: relative; display: grid; }
.hfu-deck > .hfu-card { grid-area: 1 / 1; }
.hfu-card { position: relative; border-radius: 1rem; padding: 0.875rem 1rem; background: var(--card); text-align: left;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 12%, transparent), 0 18px 40px -24px rgb(0 0 0 / 0.5); }
.hfu-draft-box { margin-top: 0.625rem; border-radius: 0.75rem; padding: 0.625rem 0.75rem; font-size: 0.8125rem; line-height: 1.375rem; color: var(--foreground);
  outline: 1px dashed color-mix(in oklab, var(--foreground) 22%, transparent); outline-offset: -1px; }
.hfu-actions { display: flex; align-items: center; justify-content: center; gap: 0.625rem; margin-top: 1.75rem; }
.hfu-action { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 999px; color: var(--foreground);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 14%, transparent); }
.hfu-action[data-kind="send"] { width: 2.75rem; height: 2.75rem; color: var(--background); background: var(--foreground); box-shadow: none; }
.hfu-action[data-kind="delete"] { color: var(--destructive); box-shadow: none; }
.hfu-hint { margin-top: 0.75rem; text-align: center; font-size: 0.6875rem; line-height: 1rem; color: var(--muted-foreground); }
.hfu-stamp { position: absolute; top: 0.875rem; right: 1rem; z-index: 1; border-radius: 0.5rem; padding: 0.125rem 0.5rem;
  font-size: 0.6875rem; font-weight: 600; color: var(--background); background: var(--foreground); opacity: 0; }
.hfu-stamp[data-kind="later"] { left: 1rem; right: auto; color: var(--foreground); background: var(--card);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 30%, transparent); }
.hfu-swap { display: inline-grid; }
.hfu-swap > * { grid-area: 1 / 1; white-space: nowrap; }
.hfu-swipes { display: grid; justify-items: center; margin-top: 0.75rem; min-height: 1.75rem; }
.hfu-swipes > * { grid-area: 1 / 1; }
.hfu-swipe { display: inline-flex; align-items: center; gap: 0.375rem; border-radius: 999px; padding: 0.25rem 0.75rem;
  font-size: 0.75rem; font-weight: 500; white-space: nowrap; color: var(--foreground); background: var(--card);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 16%, transparent); }
.hfu-swipe[data-dir="right"] { color: var(--background); background: var(--foreground); box-shadow: none; }
.hfu-swipe svg { animation: hfu-nudge 0.9s ease-in-out infinite; }
.hfu-swipe[data-dir="left"] svg { animation-name: hfu-nudge-l; }
@keyframes hfu-nudge { 0%, 100% { transform: none; } 50% { transform: translateX(0.2rem); } }
@keyframes hfu-nudge-l { 0%, 100% { transform: none; } 50% { transform: translateX(-0.2rem); } }
.hfu-at, .hfu-loop { animation-duration: ${FOLLOW_UP_LOOP}s; animation-iteration-count: infinite; animation-fill-mode: both;
  animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1); }
.hfu-pulse { animation: hfu-pulse 1.6s ease-in-out infinite; }
@keyframes hfu-pulse { 0%, 100% { opacity: 1; transform: none; } 50% { opacity: 0.45; transform: translateX(0.25rem); } }
${ENTRANCES}
${DECK}
@media (max-width: 63.99rem) {
  /* stacked steps: one shared 12 s clock left steps 2 and 3 blank (an empty deck) while you scroll to them, so below
     the three-column layout the story shows its resting state, the same as with reduced motion */
  .hfu-at, .hfu-loop, .hfu-pulse { animation: none; }
  .hfu-stamp, .hfu-transient, .hfu-swipes { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .hfu-at, .hfu-loop, .hfu-pulse, .hfu-swipe svg { animation: none !important; }
  .hfu-stamp, .hfu-transient, .hfu-swipes { display: none !important; }
}
`;
