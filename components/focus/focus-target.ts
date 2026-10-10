"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { findAgentUiTarget } from "@/ee/agent-chat/ui-targets";
import { FOCUS_PARAM, focusKey, parseFocus, type FocusKind, type FocusTarget } from "./focus-href";

const HIGHLIGHT_MS = 2400;
const WAIT_MS = 6000;
const highlightTimers = new WeakMap<HTMLElement, number>();

function clearFocusParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete(FOCUS_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function highlightFocusTarget(target: FocusTarget) {
  const selector = `[data-focus-target="${CSS.escape(focusKey(target))}"]`;
  const started = Date.now();
  const attempt = () => {
    const element =
      target.kind === "control"
        ? document.getElementById(findAgentUiTarget(target.id)?.elementId ?? target.id)
        : document.querySelector<HTMLElement>(selector);
    if (!element) {
      if (Date.now() - started < WAIT_MS) window.setTimeout(attempt, 120);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ block: "center", inline: "center", behavior: reduced ? "auto" : "smooth" });
    element.setAttribute("data-focus-highlight", "");
    window.clearTimeout(highlightTimers.get(element));
    highlightTimers.set(
      element,
      window.setTimeout(() => element.removeAttribute("data-focus-highlight"), HIGHLIGHT_MS),
    );
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
    const target = parseFocus(value);
    if (!ready || !target || !kinds.includes(target.kind) || handled.current === value) return;
    if (!openRef.current(target)) return;
    handled.current = value;
    clearFocusParam();
    highlightFocusTarget(target);
  }, [kinds, ready, value]);
}
