"use client";

import type { ReactNode } from "react";
import type { Camera } from "./map-geometry";
import type { ClusterIndex, ClusterMarker, MarkerSpread, PinMarker } from "./map-markers";
import type { ScreenBox } from "./map-painter";
import type { MapPalette } from "./map-palette";
import type { MapViewProps } from "./map-types";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/core/utils/cn";

import { MapControls } from "./map-controls";
import {
  EUROPE_BOUNDS,
  MAX_ZOOM,
  clampCamera,
  fitCamera,
  interpolateCamera,
  isValidCoordinate,
  lonLatToWorldBounds,
  minZoomFor,
  panBy,
  project,
  toScreen,
  visibleWorldBounds,
  worldBoundsOf,
  zoomAround,
} from "./map-geometry";
import { MapMarkerLayer, markerBox, markerTransform } from "./map-marker-layer";
import { clusterLeafIds, computeMarkers, createClusterIndex } from "./map-markers";
import { paintBasemap } from "./map-painter";
import { MAP_COLOR_TOKENS, resolvePalette, textTokenResolver } from "./map-palette";
import { MapPinPopover } from "./map-pin-popover";
import { useBasemap } from "./use-basemap";
import { useElementSize } from "./use-element-size";
import { useMapGestures } from "./use-map-gestures";

export type { MapViewLabels, MapViewPoint, MapViewProps } from "./map-types";

const ANIMATION_MS = 300;
const KEY_PAN_SHARE = 0.25;
const DETAIL_MARGIN = 0.1;

type SpreadState = MarkerSpread & { clusters: ClusterIndex; zoom: number };

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function pageLanguage() {
  return (document.documentElement.lang.split("-")[0] ?? "").toLowerCase();
}

function defaultTextColor() {
  return MAP_COLOR_TOKENS.lightText;
}

export default function MapView({
  points,
  label,
  labels,
  selectedId,
  onSelect,
  renderPopover,
  className,
}: MapViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const markerElements = useRef(new Map<string, HTMLElement>());
  const size = useElementSize(viewportRef);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const cameraRef = useRef<Camera | null>(null);
  const targetRef = useRef<Camera | null>(null);
  const interactedRef = useRef(false);
  const animationRef = useRef(0);
  const frameRef = useRef(0);
  const paletteRef = useRef<{ palette: MapPalette; fontFamily: string } | null>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const controlBoxesRef = useRef<ScreenBox[]>([]);
  const [settled, setSettled] = useState<Camera | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);
  const [textColor, setTextColor] = useState<(color: string) => string>(() => defaultTextColor);
  const [spread, setSpread] = useState<SpreadState | null>(null);
  const lastSelectedRef = useRef(selectedId);
  if (selectedId !== null) lastSelectedRef.current = selectedId;
  const popoverId = lastSelectedRef.current;
  const popoverContentRef = useRef<ReactNode>(null);

  const clusters = useMemo(() => createClusterIndex(points), [points]);
  const fitBounds = useMemo(
    () =>
      worldBoundsOf(
        points.filter((point) => isValidCoordinate(point.lon, point.lat)).map((point) => project(point.lon, point.lat)),
      ) ?? lonLatToWorldBounds(EUROPE_BOUNDS),
    [points],
  );

  const scheduleFrame = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      drawRef.current();
    });
  }, []);

  const basemap = useBasemap(scheduleFrame);
  const basemapRef = useRef(basemap);
  basemapRef.current = basemap;

  const activeSpread =
    spread && settled && spread.clusters === clusters && Math.abs(spread.zoom - settled.zoom) < 1e-6 ? spread : null;
  const markers = useMemo(
    () =>
      settled && size.width > 0 && size.height > 0
        ? computeMarkers({ clusters, camera: settled, size, selectedId, spread: activeSpread })
        : [],
    [activeSpread, clusters, selectedId, settled, size],
  );
  const markersRef = useRef(markers);
  markersRef.current = markers;

  drawRef.current = () => {
    const camera = cameraRef.current;
    const currentSize = sizeRef.current;
    if (!camera) return;
    for (const marker of markersRef.current) {
      const element = markerElements.current.get(marker.key);
      if (element) element.style.transform = markerTransform(marker, camera, currentSize);
    }
    const canvas = canvasRef.current;
    const resolved = paletteRef.current;
    if (!canvas || !resolved || typeof Path2D === "undefined") return;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(currentSize.width * ratio));
    const height = Math.max(1, Math.round(currentSize.height * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const { world, detailsInView } = basemapRef.current;
    paintBasemap(context, {
      camera,
      size: currentSize,
      ratio,
      palette: resolved.palette,
      world: world?.layers ?? null,
      details: detailsInView(visibleWorldBounds(camera, currentSize, DETAIL_MARGIN)),
      language: pageLanguage(),
      fontFamily: resolved.fontFamily,
      obstacles: [
        ...controlBoxesRef.current,
        ...markersRef.current.map((marker) => markerBox(marker, camera, currentSize)),
      ],
    });
  };

  const stopAnimation = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = 0;
    targetRef.current = null;
  }, []);

  const move = useCallback(
    (camera: Camera) => {
      cameraRef.current = camera;
      interactedRef.current = true;
      scheduleFrame();
    },
    [scheduleFrame],
  );

  const settle = useCallback(() => {
    if (cameraRef.current) setSettled(cameraRef.current);
  }, []);

  const flyTo = useCallback(
    (target: Camera) => {
      stopAnimation();
      const from = cameraRef.current;
      if (!from) return;
      const to = clampCamera(target, sizeRef.current);
      if (prefersReducedMotion()) {
        cameraRef.current = to;
        drawRef.current();
        setSettled(to);
        return;
      }
      targetRef.current = to;
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, Math.max(0, (now - start) / ANIMATION_MS));
        cameraRef.current = clampCamera(interpolateCamera(from, to, 1 - (1 - progress) ** 3), sizeRef.current);
        drawRef.current();
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(step);
          return;
        }
        animationRef.current = 0;
        targetRef.current = null;
        cameraRef.current = to;
        setSettled(to);
      };
      animationRef.current = requestAnimationFrame(step);
    },
    [stopAnimation],
  );

  const zoomBy = (delta: number) => {
    const camera = targetRef.current ?? cameraRef.current;
    if (!camera) return;
    interactedRef.current = true;
    const { width, height } = sizeRef.current;
    flyTo(zoomAround(camera, sizeRef.current, { x: width / 2, y: height / 2 }, camera.zoom + delta));
  };

  const panStep = (dx: number, dy: number) => {
    const camera = targetRef.current ?? cameraRef.current;
    if (!camera) return;
    interactedRef.current = true;
    flyTo(panBy(camera, sizeRef.current, dx, dy));
  };

  const reset = () => {
    interactedRef.current = false;
    setSpread(null);
    flyTo(fitCamera(fitBounds, sizeRef.current));
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const { width, height } = sizeRef.current;
    switch (event.key) {
      case "+":
      case "=":
        zoomBy(1);
        break;
      case "-":
      case "_":
        zoomBy(-1);
        break;
      case "0":
        reset();
        break;
      case "ArrowLeft":
        panStep(-width * KEY_PAN_SHARE, 0);
        break;
      case "ArrowRight":
        panStep(width * KEY_PAN_SHARE, 0);
        break;
      case "ArrowUp":
        panStep(0, -height * KEY_PAN_SHARE);
        break;
      case "ArrowDown":
        panStep(0, height * KEY_PAN_SHARE);
        break;
      case "Escape":
        if (!activeSpread) return;
        setSpread(null);
        viewportRef.current?.focus({ preventScroll: true });
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onTap = () => {
    setSpread(null);
    if (selectedId !== null) onSelect(null);
  };

  useMapGestures(viewportRef, {
    camera: () => cameraRef.current,
    size: () => sizeRef.current,
    move,
    settle,
    stop: stopAnimation,
    zoomTo: (camera) => {
      interactedRef.current = true;
      flyTo(camera);
    },
    tap: onTap,
    key: onKey,
  });

  const onPin = (marker: PinMarker) => onSelect(selectedId === marker.id ? null : marker.id);

  const onCluster = (marker: ClusterMarker) => {
    const camera = cameraRef.current;
    if (!camera || !settled) return;
    interactedRef.current = true;
    viewportRef.current?.focus({ preventScroll: true });
    if (marker.expansionZoom <= MAX_ZOOM) {
      setSpread(null);
      flyTo({ x: marker.world.x, y: marker.world.y, zoom: marker.expansionZoom });
      return;
    }
    setSpread({
      clusterId: marker.clusterId,
      world: marker.world,
      ids: clusterLeafIds(clusters, marker.clusterId),
      clusters,
      zoom: settled.zoom,
    });
  };

  const register = useCallback((key: string, element: HTMLElement | null) => {
    if (element) markerElements.current.set(key, element);
    else markerElements.current.delete(key);
  }, []);

  const anchorRect = useCallback(() => {
    const id = lastSelectedRef.current;
    const element = id === null ? undefined : markerElements.current.get(`pin:${id}`);
    return (element ?? viewportRef.current ?? document.body).getBoundingClientRect();
  }, []);

  useLayoutEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const current = cameraRef.current;
    const next = current && interactedRef.current ? clampCamera(current, size) : fitCamera(fitBounds, size);
    stopAnimation();
    cameraRef.current = next;
    setSettled(next);
  }, [fitBounds, size, stopAnimation]);

  useEffect(() => {
    const bump = () => setThemeVersion((version) => version + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    const scheme = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    scheme?.addEventListener("change", bump);
    void document.fonts?.ready.then(bump).catch(() => undefined);
    return () => {
      observer.disconnect();
      scheme?.removeEventListener("change", bump);
    };
  }, []);

  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    paletteRef.current = { palette: resolvePalette(probe), fontFamily: getComputedStyle(probe).fontFamily };
    setTextColor(() => textTokenResolver(probe));
  }, [themeVersion]);

  useEffect(() => {
    if (settled) basemap.requestDetails(visibleWorldBounds(settled, size, DETAIL_MARGIN), settled.zoom);
  }, [basemap.requestDetails, settled, size]);

  useEffect(() => {
    if (!activeSpread) return;
    const [first] = activeSpread.ids;
    if (first !== undefined) markerElements.current.get(`pin:${first}`)?.focus({ preventScroll: true });
  }, [activeSpread]);

  const previousSelectedRef = useRef(selectedId);
  useEffect(() => {
    if (selectedId === previousSelectedRef.current) return;
    previousSelectedRef.current = selectedId;
    const camera = cameraRef.current;
    const point = selectedId === null ? undefined : points.find((candidate) => candidate.id === selectedId);
    if (!camera || !point || !isValidCoordinate(point.lon, point.lat)) return;
    const world = project(point.lon, point.lat);
    const { x, y } = toScreen(camera, sizeRef.current, world);
    if (x >= 0 && y >= 0 && x <= sizeRef.current.width && y <= sizeRef.current.height) return;
    flyTo({ ...camera, x: world.x, y: world.y });
  }, [flyTo, points, selectedId]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current?.getBoundingClientRect();
    const controls = rootRef.current?.querySelectorAll("[data-map-control]") ?? [];
    controlBoxesRef.current = viewport
      ? Array.from(controls, (control) => {
          const { left, top, right, bottom } = control.getBoundingClientRect();
          return {
            left: left - viewport.left,
            top: top - viewport.top,
            right: right - viewport.left,
            bottom: bottom - viewport.top,
          };
        })
      : [];
    scheduleFrame();
  });

  useEffect(
    () => () => {
      stopAnimation();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    },
    [stopAnimation],
  );

  const popoverOpen =
    selectedId !== null && markers.some((marker) => marker.kind === "pin" && marker.id === selectedId);
  if (popoverOpen) popoverContentRef.current = renderPopover(selectedId);
  const camera = cameraRef.current ?? settled;

  return (
    <div
      ref={rootRef}
      data-map-root
      className={cn(
        "relative isolate size-full min-h-48 overflow-clip rounded-lg bg-[color-mix(in_oklab,var(--info)_10%,var(--background))]",
        className,
      )}
    >
      <div
        ref={viewportRef}
        data-map-viewport
        aria-label={label}
        className="absolute inset-0 cursor-grab touch-none outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset active:cursor-grabbing"
        data-zoom={settled ? String(Math.round(settled.zoom * 1000) / 1000) : undefined}
        role="application"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the map viewport takes keyboard pan and zoom
        tabIndex={0}
      >
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />

        <span ref={probeRef} aria-hidden className="hidden" />

        {camera ? (
          <MapMarkerLayer
            camera={camera}
            labels={labels}
            markers={markers}
            register={register}
            selectedId={selectedId}
            size={size}
            textColor={textColor}
            onCluster={onCluster}
            onPin={onPin}
          />
        ) : null}
      </div>

      <MapControls
        canZoomIn={Boolean(settled && settled.zoom < MAX_ZOOM - 1e-6)}
        canZoomOut={Boolean(settled && settled.zoom > minZoomFor(size) + 1e-6)}
        labels={labels}
        status={basemap.status}
        onReset={reset}
        onRetry={basemap.retry}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
      />

      {popoverId !== null ? (
        <MapPinPopover
          key={popoverId}
          anchorRect={anchorRect}
          boundary={rootRef.current}
          fallback={viewportRef.current}
          label={labels.point(popoverId)}
          open={popoverOpen}
          opener={markerElements.current.get(`pin:${popoverId}`) ?? null}
          onClose={() => onSelect(null)}
        >
          {popoverContentRef.current}
        </MapPinPopover>
      ) : null}
    </div>
  );
}
