"use client";

import { useEffect, useState } from "react";
import { ClockIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

export function TimeInput({ id, value, onChange, use12Hour, disabled, className }: Props) {
  const [text, setText] = useState(() => formatForDisplay(value, use12Hour));

  useEffect(() => {
    setText(formatForDisplay(value, use12Hour));
  }, [value, use12Hour]);

  function commit() {
    const parsed = parseTime(text);
    if (parsed) {
      onChange(parsed);
      setText(formatForDisplay(parsed, use12Hour));
      return;
    }
    setText(formatForDisplay(value, use12Hour));
  }

  return (
    <div className="relative">
      <ClockIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

      <Input
        className={cn("h-9 pl-9 font-mono tabular-nums", className)}
        disabled={disabled}
        id={id}
        inputMode="numeric"
        placeholder={use12Hour ? "12:00:00 AM" : "00:00:00"}
        type="text"
        value={text}
        onBlur={commit}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
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

  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");

  if (!use12Hour) return `${hh}:${mm}:${ss}`;

  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${mm}:${ss} ${period}`;
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
