"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

type TokenRow = {
  name: string;
  role: string;
};

type TypeRow = {
  className: string;
  sample: string;
};

function sameValues(a: Record<string, string>, b: Record<string, string>) {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((key) => a[key] === b[key]);
}

export function TokenTable({ rows }: { rows: TokenRow[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const style = getComputedStyle(host);
    const next = Object.fromEntries(rows.map((row) => [row.name, style.getPropertyValue(row.name).trim()]));
    setValues((current) => (sameValues(current, next) ? current : next));
  }, [rows, resolvedTheme]);

  return (
    <div ref={hostRef} className="overflow-hidden rounded-card border border-border bg-card">
      <div className="text-eyebrow flex items-center justify-between border-b border-border px-5 py-3">
        <span>Resolved in the browser</span>

        <span>{mounted ? (resolvedTheme ?? "—") : "—"}</span>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <span
              className="size-8 shrink-0 rounded-md border border-border"
              style={{ background: `var(${row.name})` }}
            />

            <code className="w-40 shrink-0 font-mono text-sm">{row.name}</code>

            <code className="text-meta w-32 shrink-0 font-mono">{values[row.name] || "…"}</code>

            <span className="min-w-40 flex-1 text-sm text-muted-foreground">{row.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TypeTable({ rows }: { rows: TypeRow[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const next: Record<string, string> = {};
    for (const row of rows) {
      const element = host.querySelector(`[data-type-role="${row.className}"]`);
      if (!element) continue;

      const style = getComputedStyle(element);
      next[row.className] = `${style.fontSize} / ${style.fontWeight} / ${style.letterSpacing} / ${style.lineHeight}`;
    }
    setValues((current) => (sameValues(current, next) ? current : next));
  }, [rows, resolvedTheme]);

  return (
    <div ref={hostRef} className="flex flex-col gap-8">
      {rows.map((row) => (
        <div key={row.className} className="border-b border-border pb-8 last:border-b-0 last:pb-0">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <code className="font-mono text-sm">.{row.className}</code>

            <code className="text-meta font-mono">{values[row.className] || "…"}</code>

            <span className="text-meta">size / weight / tracking / leading</span>
          </div>

          <div className={row.className} data-type-role={row.className}>
            {row.sample}
          </div>
        </div>
      ))}
    </div>
  );
}
