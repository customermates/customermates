"use client";

import type { DetailLayers } from "./map-painter";
import type { WorldBounds } from "./map-geometry";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DETAIL_ZOOM,
  basemapLoader,
  regionsInView,
  type BasemapLayers,
  type BasemapLoader,
  type BasemapWorld,
} from "./map-basemap";

export type BasemapStatus = "loading" | "ready" | "failed";

export function useBasemap(onDetail: () => void, loader: BasemapLoader = basemapLoader) {
  const [world, setWorld] = useState<BasemapWorld | null>(null);
  const [status, setStatus] = useState<BasemapStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const details = useRef(new Map<string, BasemapLayers>());
  const pending = useRef(new Set<string>());
  const mounted = useRef(true);
  const onDetailRef = useRef(onDetail);
  onDetailRef.current = onDetail;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    void loader.loadWorld().then(
      (loaded) => {
        if (!active) return;
        setWorld(loaded);
        setStatus("ready");
      },
      () => {
        if (active) setStatus("failed");
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, loader]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  const requestDetails = useCallback(
    (view: WorldBounds, zoom: number) => {
      if (!world || zoom < DETAIL_ZOOM) return;
      for (const region of regionsInView(world.regions, view)) {
        if (details.current.has(region.id) || pending.current.has(region.id)) continue;
        pending.current.add(region.id);
        void loader
          .loadRegion(region)
          .then((layers) => {
            details.current.set(region.id, layers);
            if (mounted.current) onDetailRef.current();
          })
          .catch(() => undefined)
          .finally(() => pending.current.delete(region.id));
      }
    },
    [loader, world],
  );

  const detailsInView = useCallback(
    (view: WorldBounds): DetailLayers[] =>
      world
        ? regionsInView(world.regions, view).flatMap((region) => {
            const layers = details.current.get(region.id);
            return layers ? [{ bounds: region.bounds, layers }] : [];
          })
        : [],
    [world],
  );

  return { world, status, retry, requestDetails, detailsInView };
}
