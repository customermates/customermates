import type { BasemapLayers, BasemapPlace, Polyline } from "./map-basemap";
import type { MapPalette } from "./map-palette";

import { DETAIL_ZOOM } from "./map-basemap";
import { scaleOf, toScreen, visibleWorldBounds, type Camera, type MapSize, type WorldBounds } from "./map-geometry";

export const LABEL_ZOOM_OFFSET = 1;
export const STATE_ZOOM_OFFSET = 1.5;
export const LABEL_FONT_SIZE = 11;
export const LABEL_LIMIT = 80;
const LABEL_GAP = 5;
const LABEL_PADDING = 3;
const DOT_RADIUS = 2;
const COAST_WIDTH = 1;
const BORDER_WIDTH = 1;
const STATE_WIDTH = 0.75;
const STATE_ALPHA = 0.7;

export type DetailLayers = { bounds: WorldBounds; layers: BasemapLayers };

export type PaintScene = {
  camera: Camera;
  size: MapSize;
  ratio: number;
  palette: MapPalette;
  world: BasemapLayers | null;
  details: readonly DetailLayers[];
  language: string;
  fontFamily: string;
  obstacles: readonly ScreenBox[];
};

export type LabelPlacement = { x: number; y: number; textX: number; text: string; align: "left" | "right" };

export type ScreenBox = { left: number; top: number; right: number; bottom: number };

const closedPaths = new WeakMap<Polyline[], Path2D>();
const openPaths = new WeakMap<Polyline[], Path2D>();
const textWidths = new Map<string, number>();

function pathOf(polylines: Polyline[], closed: boolean) {
  const cache = closed ? closedPaths : openPaths;
  const existing = cache.get(polylines);
  if (existing) return existing;
  const path = new Path2D();
  for (const line of polylines) {
    if (line.length < 4) continue;
    path.moveTo(line[0], line[1]);
    for (let index = 2; index < line.length; index += 2) path.lineTo(line[index], line[index + 1]);
    if (closed) path.closePath();
  }
  cache.set(polylines, path);
  return path;
}

function overlaps(left: ScreenBox, right: ScreenBox) {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

export function placeName(place: BasemapPlace, language: string) {
  return place.names[language] ?? place.name;
}

export function placeLabels(
  places: readonly BasemapPlace[],
  camera: Camera,
  size: MapSize,
  language: string,
  measure: (text: string) => number,
  obstacles: readonly ScreenBox[] = [],
): LabelPlacement[] {
  const candidates = places
    .filter((place) => place.minZoom <= camera.zoom + LABEL_ZOOM_OFFSET)
    .sort(
      (left, right) => left.minZoom - right.minZoom || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
    );
  const placed: LabelPlacement[] = [];
  const boxes: ScreenBox[] = [...obstacles];
  const half = LABEL_FONT_SIZE / 2 + 2;
  for (const place of candidates) {
    if (placed.length >= LABEL_LIMIT) break;
    const { x, y } = toScreen(camera, size, place);
    if (x < 0 || y < 0 || x > size.width || y > size.height) continue;
    const text = placeName(place, language);
    const width = measure(text);
    const right: ScreenBox = {
      left: x - LABEL_PADDING,
      top: y - half,
      right: x + LABEL_GAP + width + LABEL_PADDING,
      bottom: y + half,
    };
    const left: ScreenBox = {
      left: x - LABEL_GAP - width - LABEL_PADDING,
      top: y - half,
      right: x + LABEL_PADDING,
      bottom: y + half,
    };
    const options: [ScreenBox, LabelPlacement["align"]][] = [
      [right, "left"],
      [left, "right"],
    ];
    const fitting = options.find(
      ([box]) => box.left >= 0 && box.right <= size.width && !boxes.some((other) => overlaps(box, other)),
    );
    if (!fitting) continue;
    const [box, align] = fitting;
    boxes.push(box);
    placed.push({ x, y, text, align, textX: align === "left" ? x + LABEL_GAP : x - LABEL_GAP });
  }
  return placed;
}

function measureText(context: CanvasRenderingContext2D, text: string) {
  const key = `${context.font}\u0000${text}`;
  const known = textWidths.get(key);
  if (known !== undefined) return known;
  const width = context.measureText(text).width;
  textWidths.set(key, width);
  return width;
}

function withoutDetail(
  context: CanvasRenderingContext2D,
  view: WorldBounds,
  details: readonly DetailLayers[],
  draw: () => void,
) {
  if (details.length === 0) {
    draw();
    return;
  }
  context.save();
  context.beginPath();
  context.rect(view.minX, view.minY, view.maxX - view.minX, view.maxY - view.minY);
  for (const { bounds } of details)
    context.rect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  context.clip("evenodd");
  draw();
  context.restore();
}

export function paintBasemap(context: CanvasRenderingContext2D, scene: PaintScene) {
  const { camera, size, ratio, palette, world, language, fontFamily } = scene;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (!world) return;
  const details = camera.zoom >= DETAIL_ZOOM ? scene.details : [];
  const scale = scaleOf(camera.zoom);
  const view = visibleWorldBounds(camera, size, 0.05);
  context.setTransform(
    ratio * scale,
    0,
    0,
    ratio * scale,
    ratio * (size.width / 2 - camera.x * scale),
    ratio * (size.height / 2 - camera.y * scale),
  );
  context.fillStyle = palette.land;
  withoutDetail(context, view, details, () => context.fill(pathOf(world.land, true)));
  for (const { layers } of details) context.fill(pathOf(layers.land, true));
  context.lineJoin = "round";
  context.lineCap = "round";
  context.strokeStyle = palette.border;
  context.globalAlpha = STATE_ALPHA;
  context.lineWidth = STATE_WIDTH / scale;
  for (const { layers } of details) {
    for (const { minZoom, lines } of layers.states)
      if (minZoom <= camera.zoom + STATE_ZOOM_OFFSET) context.stroke(pathOf(lines, false));
  }
  context.globalAlpha = 1;
  context.lineWidth = COAST_WIDTH / scale;
  withoutDetail(context, view, details, () => context.stroke(pathOf(world.coast, false)));
  for (const { layers } of details) context.stroke(pathOf(layers.coast, false));
  context.lineWidth = BORDER_WIDTH / scale;
  withoutDetail(context, view, details, () => context.stroke(pathOf(world.borders, false)));
  for (const { layers } of details) context.stroke(pathOf(layers.borders, false));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.font = `500 ${LABEL_FONT_SIZE}px ${fontFamily}`;
  context.textBaseline = "middle";
  const places = [world.places, ...details.map(({ layers }) => layers.places)].flat();
  const labels = placeLabels(places, camera, size, language, (text) => measureText(context, text), scene.obstacles);
  context.fillStyle = palette.label;
  for (const { x, y } of labels) {
    context.beginPath();
    context.arc(x, y, DOT_RADIUS, 0, 2 * Math.PI);
    context.fill();
  }
  context.lineWidth = 3;
  context.strokeStyle = palette.halo;
  for (const { textX, y, text, align } of labels) {
    context.textAlign = align;
    context.strokeText(text, textX, y);
    context.fillText(text, textX, y);
  }
}
