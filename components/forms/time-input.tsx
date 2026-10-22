"use client";

import { useEffect, useState } from "react";
import { ClockIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/core/utils/cn";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  use12Hour: boolean;
  disabled?: boolean;
  className?: string;
};

const TIME_PATTERN_24 = /^([01]?\d|2[0-3]):([0-5]?\d)(?::([0-5]?\d))?$/;
const TIME_PATTERN_12 = /^(0?[1-9]|1[0-2]):([0-5]?\d)(?::([0-5]?\d))?\s*(am|pm)$/i;
const STEP_MINUTES = 15;
const DAY_MINUTES = 24 * 60;
const PLACEHOLDER_TIME = "09:00:00";

export function TimeInput({ id, value, onChange, use12Hour, disabled, className }: Props) {
  const [text, setText] = useState(() => formatForDisplay(value, use12Hour));

  useEffect(() => {
    setText(formatForDisplay(value, use12Hour));
  }, [value, use12Hour]);

  function apply(next: string) {
    onChange(next);
    setText(formatForDisplay(next, use12Hour));
  }

  function commit() {
    const parsed = parseTime(text);
    if (parsed) apply(parsed);
    else setText(formatForDisplay(value, use12Hour));
  }

  function step(direction: 1 | -1) {
    const [h, m] = (parseTime(text) ?? value ?? PLACEHOLDER_TIME).split(":").map(Number);
    const minutes = h * 60 + m;
    const snapped =
      direction > 0
        ? Math.floor(minutes / STEP_MINUTES) * STEP_MINUTES + STEP_MINUTES
        : Math.ceil(minutes / STEP_MINUTES) * STEP_MINUTES - STEP_MINUTES;
    const next = (snapped + DAY_MINUTES) % DAY_MINUTES;
    apply(toIsoLikeTime(Math.floor(next / 60), next % 60, 0));
  }

  return (
    <div className="relative">
      <ClockIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

      <Input
        className={cn("h-9 pl-8 tabular-nums", className)}
        disabled={disabled}
        id={id}
        inputMode="numeric"
        placeholder={formatForDisplay(PLACEHOLDER_TIME, use12Hour)}
        type="text"
        value={text}
        onBlur={commit}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            step(e.key === "ArrowUp" ? 1 : -1);
          }
        }}
      />
    </div>
  );
}

function formatForDisplay(value: string, use12Hour: boolean): string {
  if (!value) return "";
  const parts = value.split(":").map((p) => Number(p));
  const [h, m, s = 0] = parts;
  if (![h, m, s].every((n) => Number.isFinite(n))) return value;

  const mm = String(m).padStart(2, "0");
  const seconds = s ? `:${String(s).padStart(2, "0")}` : "";

  if (!use12Hour) return `${String(h).padStart(2, "0")}:${mm}${seconds}`;

  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${seconds} ${period}`;
}

function parseTime(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const m12 = trimmed.match(TIME_PATTERN_12);
  if (m12) {
    let h = Number(m12[1]);
    const mm = Number(m12[2]);
    const ss = Number(m12[3] ?? 0);
    const period = m12[4].toLowerCase();
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    return toIsoLikeTime(h, mm, ss);
  }

  const m24 = trimmed.match(TIME_PATTERN_24);
  if (m24) {
    const h = Number(m24[1]);
    const mm = Number(m24[2]);
    const ss = Number(m24[3] ?? 0);
    return toIsoLikeTime(h, mm, ss);
  }

  return undefined;
}

function toIsoLikeTime(h: number, m: number, s: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
