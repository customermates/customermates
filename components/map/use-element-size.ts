"use client";

import type { RefObject } from "react";
import type { MapSize } from "./map-geometry";

import { useLayoutEffect, useState } from "react";

const EMPTY_SIZE: MapSize = { width: 0, height: 0 };

export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<MapSize>(EMPTY_SIZE);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const { width, height } = element.getBoundingClientRect();
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
