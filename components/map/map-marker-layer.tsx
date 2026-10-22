"use client";

import type { KeyboardEvent } from "react";
import type { ClusterMarker, MapMarker, PinMarker } from "./map-markers";
import type { ScreenBox } from "./map-painter";
import type { MapViewLabels } from "./map-types";

import { getChartColors, getChartTextColors, getChartTintColors } from "@/constants/chart-colors";
import { cn } from "@/core/utils/cn";

import { toScreen, type Camera, type MapSize } from "./map-geometry";

function markerDiameter(marker: MapMarker) {
  return marker.kind === "pin" ? marker.radius * 2 : marker.diameter;
}

function markerCenter(marker: MapMarker, camera: Camera, size: MapSize) {
  const { x, y } = toScreen(camera, size, marker.world);
  return marker.kind === "pin" ? { x: x + marker.offset.x, y: y + marker.offset.y } : { x, y };
}

export function markerTransform(marker: MapMarker, camera: Camera, size: MapSize) {
  const { x, y } = markerCenter(marker, camera, size);
  const half = markerDiameter(marker) / 2;
  return `translate3d(${x - half}px, ${y - half}px, 0)`;
}

export function markerBox(marker: MapMarker, camera: Camera, size: MapSize): ScreenBox {
  const { x, y } = markerCenter(marker, camera, size);
  const half = markerDiameter(marker) / 2 + 2;
  return { left: x - half, top: y - half, right: x + half, bottom: y + half };
}

const MARKER_CLASS =
  "pointer-events-auto absolute top-0 left-0 rounded-full border-2 border-card outline-none transition-[box-shadow] duration-150 hover:ring-2 hover:ring-ring/40 focus-visible:ring-[3px] focus-visible:ring-ring/60 motion-reduce:transition-none";

type Props = {
  markers: readonly MapMarker[];
  camera: Camera;
  size: MapSize;
  selectedId: string | null;
  labels: MapViewLabels;
  register: (key: string, element: HTMLElement | null) => void;
  onPin: (marker: PinMarker) => void;
  onCluster: (marker: ClusterMarker) => void;
};

function activateOnEnter(event: KeyboardEvent, activate: () => void) {
  if (event.key !== "Enter" || event.repeat) return;
  event.preventDefault();
  activate();
}

export function MapMarkerLayer({ markers, camera, size, selectedId, labels, register, onPin, onCluster }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {markers.map((marker) => {
        const diameter = markerDiameter(marker);
        const hidden = marker.focusable ? undefined : true;
        const tabIndex = marker.focusable ? 0 : -1;
        if (marker.kind === "cluster") {
          return (
            <button
              key={marker.key}
              ref={(element) => register(marker.key, element)}
              aria-hidden={hidden}
              aria-label={labels.cluster(marker.count)}
              className={cn(
                MARKER_CLASS,
                "flex items-center justify-center text-[11px] font-bold tabular-nums shadow-md select-none",
                marker.color === null && "border-muted-foreground bg-card text-foreground",
              )}
              data-map-marker="cluster"
              style={{
                width: diameter,
                height: diameter,
                ...(marker.color && {
                  backgroundColor: getChartTintColors()[marker.color],
                  borderColor: getChartColors()[marker.color],
                  color: getChartTextColors()[marker.color],
                }),
                transform: markerTransform(marker, camera, size),
                zIndex: 1,
              }}
              tabIndex={tabIndex}
              type="button"
              onClick={() => onCluster(marker)}
              onKeyDown={(event) => activateOnEnter(event, () => onCluster(marker))}
            >
              {marker.count}
            </button>
          );
        }
        const selected = marker.id === selectedId;
        return (
          <button
            key={marker.key}
            ref={(element) => register(marker.key, element)}
            aria-expanded={selected}
            aria-haspopup="dialog"
            aria-hidden={hidden}
            aria-label={labels.point(marker.id)}
            className={cn(
              MARKER_CLASS,
              "shadow-sm before:absolute before:-inset-2 before:rounded-full",
              selected && "ring-2 ring-ring",
            )}
            data-map-marker="pin"
            data-point-id={marker.id}
            style={{
              width: diameter,
              height: diameter,
              backgroundColor: getChartColors()[marker.color],
              transform: markerTransform(marker, camera, size),
              zIndex: selected ? 3 : 2,
            }}
            tabIndex={tabIndex}
            type="button"
            onClick={() => onPin(marker)}
            onKeyDown={(event) => activateOnEnter(event, () => onPin(marker))}
          />
        );
      })}
    </div>
  );
}
