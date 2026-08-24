import type { ReactNode } from "react";

import { cn } from "@/core/utils/cn";

export const SCENE_TYPING_CHARS_PER_SECOND = { max: 32, min: 18 } as const;

export const SCENE_MIN_RESOLVED_HOLD_MS = 1200;

export type SceneProps = {
  className?: string;
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
  label,
}: {
  children: ReactNode;
  className?: string;
  crop?: "bottom-right" | "bottom" | "none";
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
      className={cn("scene-ground scene-frame relative isolate overflow-hidden rounded-card", className)}
      role={label ? "img" : undefined}
    >
      <div className={cn("absolute", inset)}>{children}</div>
    </div>
  );
}

export function SceneWindow({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
}) {
  return (
    <div className={cn("flex w-full flex-col overflow-hidden rounded-card border border-border bg-card", className)}>
      <div className="flex shrink-0 items-center gap-[1.2cqw] border-b border-border px-[2cqw] py-[1.4cqw]">
        <span className="size-[1.1cqw] rounded-full bg-muted" />

        <span className="size-[1.1cqw] rounded-full bg-muted" />

        <span className="size-[1.1cqw] rounded-full bg-muted" />

        {title ? <span className="scene-meta ml-[1.2cqw] truncate text-muted-foreground">{title}</span> : null}
      </div>

      <div>{children}</div>
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
  from?: "them" | "draft";
}) {
  return (
    <div className={cn("flex", from === "draft" ? "justify-end" : "justify-start", className)}>
      <div
        className={cn(
          "scene-text max-w-[76%] rounded-panel px-[2.2cqw] py-[1.5cqw]",
          from === "them"
            ? "bg-muted text-foreground"
            : "border-2 border-dashed border-primary/70 bg-primary/10 text-foreground",
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
        !accent && conceptual && "border border-dashed border-input text-muted-foreground",
        !accent && !conceptual && "border border-border bg-card text-foreground",
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
        accent ? "bg-primary/12 ring-1 ring-primary/35 ring-inset" : "bg-muted",
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
