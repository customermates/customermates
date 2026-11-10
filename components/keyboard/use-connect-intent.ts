"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { CONNECT_INTENT_PARAM, readConnectIntent } from "./connect-intent";

export function useConnectIntent<T extends string>(
  allowed: readonly T[],
  enabled: boolean,
  start: (target: T) => void,
) {
  const searchParams = useSearchParams();
  const handled = useRef<string | null>(null);
  const run = useRef(start);
  run.current = start;

  useEffect(() => {
    const search = searchParams.toString();
    if (!enabled || !searchParams.has(CONNECT_INTENT_PARAM) || handled.current === search) return;
    handled.current = search;
    const target = readConnectIntent(search, allowed);
    const params = new URLSearchParams(search);
    params.delete(CONNECT_INTENT_PARAM);
    const query = params.toString();
    const path = window.location.pathname;
    window.history.replaceState(null, "", query ? `${path}?${query}` : path);
    if (target) run.current(target);
  }, [allowed, enabled, searchParams]);
}
