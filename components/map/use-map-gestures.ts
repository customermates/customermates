"use client";

import type { RefObject } from "react";

import { useEffect, useRef } from "react";

import { panBy, zoomAround, type Camera, type MapSize, type ScreenPoint } from "./map-geometry";

export const DRAG_THRESHOLD = 4;
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_DISTANCE = 24;
export const WHEEL_SETTLE_MS = 160;

export type MapGestureHandlers = {
  camera: () => Camera | null;
  size: () => MapSize;
  move: (camera: Camera) => void;
  settle: () => void;
  stop: () => void;
  zoomTo: (camera: Camera) => void;
  tap: () => void;
  key: (event: KeyboardEvent) => void;
};

type Gesture = { camera: Camera; start: Map<number, ScreenPoint>; moved: boolean; fromMarker: boolean };

export function wheelZoomDelta(event: Pick<WheelEvent, "deltaY" | "deltaMode">) {
  const unit = event.deltaMode === 1 ? 0.06 : event.deltaMode === 2 ? 1 : 0.002;
  return Math.max(-1, Math.min(1, -event.deltaY * unit));
}

function distance(left: ScreenPoint, right: ScreenPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function midpoint(left: ScreenPoint, right: ScreenPoint) {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

export function useMapGestures(viewportRef: RefObject<HTMLElement | null>, handlers: MapGestureHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const pointers = new Map<number, ScreenPoint>();
    let gesture: Gesture | null = null;
    let suppressClick = false;
    let lastTap: { time: number; point: ScreenPoint } | null = null;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;

    const local = (event: MouseEvent): ScreenPoint => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const begin = (fromMarker: boolean) => {
      const camera = handlersRef.current.camera();
      if (!camera) return;
      gesture = { camera, start: new Map(pointers), moved: gesture?.moved ?? false, fromMarker };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-map-control]")) return;
      suppressClick = false;
      handlersRef.current.stop();
      const fromMarker = Boolean(target?.closest("[data-map-marker]"));
      if (!fromMarker) element.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, local(event));
      begin(fromMarker || (gesture?.fromMarker ?? false));
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      if (event.pointerType === "mouse" && event.buttons === 0) {
        onPointerEnd(event);
        return;
      }
      pointers.set(event.pointerId, local(event));
      const size = handlersRef.current.size();
      const ids = [...gesture.start.keys()];
      const [first, second] = ids.map((id) => ({ start: gesture?.start.get(id), now: pointers.get(id) }));
      if (!first?.start || !first.now) return;
      if (!second?.start || !second.now) {
        const dx = first.now.x - first.start.x;
        const dy = first.now.y - first.start.y;
        if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!gesture.moved) element.setPointerCapture?.(event.pointerId);
        gesture.moved = true;
        handlersRef.current.move(panBy(gesture.camera, size, -dx, -dy));
        return;
      }
      const startDistance = distance(first.start, second.start);
      if (startDistance === 0) return;
      gesture.moved = true;
      const startCenter = midpoint(first.start, second.start);
      const center = midpoint(first.now, second.now);
      const zoomed = zoomAround(
        gesture.camera,
        size,
        startCenter,
        gesture.camera.zoom + Math.log2(distance(first.now, second.now) / startDistance),
      );
      handlersRef.current.move(panBy(zoomed, size, startCenter.x - center.x, startCenter.y - center.y));
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
      if (pointers.size > 0) {
        begin(gesture?.fromMarker ?? false);
        return;
      }
      const finished = gesture;
      gesture = null;
      if (!finished) return;
      if (finished.moved) {
        if (finished.fromMarker) suppressClick = true;
        handlersRef.current.settle();
        return;
      }
      if (event.type === "pointercancel" || finished.fromMarker) return;
      const point = local(event);
      const now = event.timeStamp;
      if (lastTap && now - lastTap.time < DOUBLE_TAP_MS && distance(lastTap.point, point) < DOUBLE_TAP_DISTANCE) {
        lastTap = null;
        const camera = handlersRef.current.camera();
        if (camera) handlersRef.current.zoomTo(zoomAround(camera, handlersRef.current.size(), point, camera.zoom + 1));
        return;
      }
      lastTap = { time: now, point };
      handlersRef.current.tap();
    };

    const onClick = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const onWheel = (event: WheelEvent) => {
      const camera = handlersRef.current.camera();
      if (!camera) return;
      event.preventDefault();
      handlersRef.current.stop();
      handlersRef.current.move(
        zoomAround(camera, handlersRef.current.size(), local(event), camera.zoom + wheelZoomDelta(event)),
      );
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => handlersRef.current.settle(), WHEEL_SETTLE_MS);
    };

    const onKeyDown = (event: KeyboardEvent) => handlersRef.current.key(event);

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onPointerEnd);
    element.addEventListener("pointercancel", onPointerEnd);
    element.addEventListener("click", onClick, true);
    element.addEventListener("wheel", onWheel, { passive: false });
    element.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(wheelTimer);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerEnd);
      element.removeEventListener("pointercancel", onPointerEnd);
      element.removeEventListener("click", onClick, true);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("keydown", onKeyDown);
    };
  }, [viewportRef]);
}
