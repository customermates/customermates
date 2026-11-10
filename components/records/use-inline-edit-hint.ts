"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "customermates:inline-edit-hint-shown";
export const INLINE_EDIT_HINT_LIMIT = 3;

function readCount(): number {
  try {
    return Number(window.localStorage.getItem(STORAGE_KEY) ?? "0") || 0;
  } catch {
    return INLINE_EDIT_HINT_LIMIT;
  }
}

export function useInlineEditHint(enabled: boolean): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const count = readCount();
    if (count >= INLINE_EDIT_HINT_LIMIT) return;
    setShow(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(count + 1));
    } catch {
      return;
    }
  }, [enabled]);
  return show;
}
