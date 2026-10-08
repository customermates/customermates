"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { settingsHref } from "@/app/components/navigation/settings-routes";

export const FOCUS_KINDS = [
  "list",
  "field",
  "relationship",
  "activityPath",
  "routine",
  "webhook",
  "widget",
  "view",
  "record",
] as const;
export type FocusKind = (typeof FOCUS_KINDS)[number];
export type FocusTarget = { kind: FocusKind; id: string };

const FOCUS_PARAM = "focus";
const HIGHLIGHT_MS = 2400;
const WAIT_MS = 6000;

export const focusKey = (target: FocusTarget) => `${target.kind}:${target.id}`;

export function focusHref(target: FocusTarget & { typeId?: string }): string {
  const focus = `${FOCUS_PARAM}=${encodeURIComponent(focusKey(target))}`;
  if (target.kind === "list") return `/configure?${focus}`;
  if (target.kind === "field") return `/configure?typeId=${target.typeId}&tab=fields&${focus}`;
  if (target.kind === "relationship") return `/configure?typeId=${target.typeId}&tab=relationships&${focus}`;
  if (target.kind === "activityPath") return `/configure?typeId=${target.typeId}&tab=activity&${focus}`;
  if (target.kind === "routine") return `/routines?${focus}`;
  if (target.kind === "webhook") return `${settingsHref("webhooks")}?${focus}`;
  if (target.kind === "widget") return `/dashboard?${focus}`;
  if (target.kind === "view") return `/records/${target.typeId}?view=${target.id}&${focus}`;
  return `/records/${target.typeId}/${target.id}?${focus}`;
}

function readFocus(value: string | null): FocusTarget | null {
  const separator = value?.indexOf(":") ?? -1;
  if (!value || separator < 0) return null;
  const kind = value.slice(0, separator) as FocusKind;
  return FOCUS_KINDS.includes(kind) ? { kind, id: value.slice(separator + 1) } : null;
}

function clearFocusParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete(FOCUS_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function highlightFocusTarget(target: FocusTarget) {
  const selector = `[data-focus-target="${CSS.escape(focusKey(target))}"]`;
  const started = Date.now();
  const attempt = () => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
      if (Date.now() - started < WAIT_MS) window.setTimeout(attempt, 120);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ block: "center", inline: "center", behavior: reduced ? "auto" : "smooth" });
    element.setAttribute("data-focus-highlight", "");
    window.setTimeout(() => element.removeAttribute("data-focus-highlight"), HIGHLIGHT_MS);
  };
  attempt();
}

export function useFocusTarget(kinds: readonly FocusKind[], open: (target: FocusTarget) => boolean, ready = true) {
  const value = useSearchParams()?.get(FOCUS_PARAM) ?? null;
  const handled = useRef<string | null>(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    if (!value) handled.current = null;
    const target = readFocus(value);
    if (!ready || !target || !kinds.includes(target.kind) || handled.current === value) return;
    if (!openRef.current(target)) return;
    handled.current = value;
    clearFocusParam();
    highlightFocusTarget(target);
  }, [kinds, ready, value]);
}
