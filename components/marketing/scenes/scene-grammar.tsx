import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

export const SCENE_TYPING_CHARS_PER_SECOND = { max: 32, min: 18 } as const;

export const SCENE_MIN_RESOLVED_HOLD_MS = 1200;

export type SceneProps = {
  className?: string;
  film?: boolean;
  label?: string;
  t?: number;
};

export type SceneBeats = Record<string, readonly [number, number]>;

export function sceneBeatWindow(beats: SceneBeats, name: string) {
  const window = beats[name];
  if (!window) throw new Error(`unknown scene beat: ${name}`);
  return window;
}

export function sceneStream(text: string, t: number, window: readonly [number, number]) {
  const [from, to] = window;
  if (t < from) return { done: false, typing: false, visible: "" };
  if (t >= to) return { done: true, typing: false, visible: text };
  const progress = (t - from) / (to - from);
  return { done: false, typing: true, visible: text.slice(0, Math.floor(text.length * progress)) };
}

export function sceneUnstream(text: string, t: number, window: readonly [number, number]) {
  const [from, to] = window;
  if (t < from) return { done: false, typing: false, visible: text };
  if (t >= to) return { done: true, typing: false, visible: "" };
  const progress = (t - from) / (to - from);
  return { done: false, typing: true, visible: text.slice(0, Math.floor(text.length * (1 - progress))) };
}

export function sceneAfter(t: number, at: number) {
  return t >= at;
}

export function sceneCaretVisible(t: number, durationMs: number) {
  const cycles = (t * durationMs) / 1100;
  return cycles % 1 < 0.55;
}

export function SceneFrame({
  children,
  className,
  crop = "bottom-right",
  film = false,
  label,
}: {
  children: ReactNode;
  className?: string;
  crop?: "bottom-right" | "bottom" | "none";
  film?: boolean;
  label?: string;
}) {
  const inset =
    crop === "bottom-right"
      ? "left-[5%] top-[8%] right-[-8%]"
      : crop === "bottom"
        ? "left-[6%] top-[9%] right-[6%]"
        : "left-[6%] top-[9%] right-[6%] bottom-[9%]";

  return (
    <div
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn(
        "relative isolate overflow-hidden rounded-card",
        film ? "scene-frame-film bg-card" : "scene-ground scene-frame",
        className,
      )}
      role={label ? "img" : undefined}
    >
      <div className={cn(film ? "absolute inset-0" : "absolute", film ? undefined : inset)}>{children}</div>
    </div>
  );
}

export function SceneWindow({
  children,
  className,
  fill = false,
  title,
}: {
  children: ReactNode;
  className?: string;
  fill?: boolean;
  title?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-card border border-border bg-card",
        fill && "h-full",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-[1.2cqw] border-b border-border px-[2cqw] py-[1.4cqw]">
        <span className="scene-ink-surface size-[1.1cqw] rounded-full" />

        <span className="scene-ink-surface size-[1.1cqw] rounded-full" />

        <span className="scene-ink-surface size-[1.1cqw] rounded-full" />

        {title ? <span className="scene-meta scene-ink-quiet ml-[1.2cqw] truncate">{title}</span> : null}
      </div>

      <div className={cn(fill && "flex min-h-0 flex-1 flex-col")}>{children}</div>
    </div>
  );
}

export function SceneBubble({
  children,
  className,
  from = "them",
}: {
  children: ReactNode;
  className?: string;
  from?: "them" | "draft" | "mine";
}) {
  return (
    <div className={cn("flex", from === "them" ? "justify-start" : "justify-end", className)}>
      <div
        className={cn(
          "scene-text max-w-[76%] rounded-panel px-[2.2cqw] py-[1.5cqw]",
          from === "them" && "scene-ink-surface scene-ink-body",
          from === "draft" && "scene-ink-accent border-2 border-dashed border-primary/70 text-foreground",
          from === "mine" && "scene-ink-accent border-2 border-solid border-primary/70 text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SceneLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-eyebrow", className)}>{children}</p>;
}

export function SceneChip({
  accent = false,
  children,
  conceptual = false,
}: {
  accent?: boolean;
  children: ReactNode;
  conceptual?: boolean;
}) {
  return (
    <span
      className={cn(
        "scene-meta rounded-full px-[1.6cqw] py-[0.7cqw]",
        accent && "bg-primary text-primary-foreground",
        !accent && conceptual && "scene-ink-quiet border border-dashed border-input",
        !accent && !conceptual && "scene-ink-body border border-border bg-card",
      )}
    >
      {children}
    </span>
  );
}

export function SceneRow({
  accent = false,
  children,
  className,
}: {
  accent?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "scene-text flex items-center gap-[1.6cqw] rounded-card px-[2cqw] py-[1.5cqw]",
        accent ? "scene-ink-accent text-foreground" : "scene-ink-surface scene-ink-body",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SceneCaret({ visible }: { visible: boolean }) {
  return (
    <span
      className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-primary"
      style={{ opacity: visible ? 1 : 0 }}
    />
  );
}
