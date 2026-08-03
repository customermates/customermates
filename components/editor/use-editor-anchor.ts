"use client";

import { useMemo, useRef } from "react";

export type EditorAnchorRect = {
  top: number;
  left: number;
  width?: number;
  height?: number;
};

type Measurable = { getBoundingClientRect: () => DOMRect };

export function useEditorAnchor(rect: EditorAnchorRect | null, contextElement?: HTMLElement | null) {
  const anchor = useMemo(() => {
    if (!rect) return null;

    const measured = new DOMRect(rect.left, rect.top, rect.width ?? 0, rect.height ?? 0);
    return { contextElement: contextElement ?? undefined, getBoundingClientRect: () => measured };
  }, [rect?.top, rect?.left, rect?.width, rect?.height, contextElement]);

  const anchorRef = useRef<Measurable | null>(null);
  anchorRef.current = anchor;

  return anchorRef as React.RefObject<Measurable>;
}
