"use client";

import { useLayoutEffect, useRef } from "react";

export function useApplyOnChange<T>(value: T, apply: (value: T) => void): void {
  const applied = useRef(value);
  useLayoutEffect(() => {
    if (applied.current === value) return;
    applied.current = value;
    apply(value);
  }, [value, apply]);
}
