export const TILE_SIZE = 256;
export const MAX_LATITUDE = 85.0511287798;
export const MAX_ZOOM = 13;
export const FIT_MAX_ZOOM = 10;
export const FIT_PADDING = 40;

export type WorldPoint = { x: number; y: number };
export type ScreenPoint = { x: number; y: number };
export type MapSize = { width: number; height: number };
export type Camera = { x: number; y: number; zoom: number };
export type WorldBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type LonLatBounds = { west: number; south: number; east: number; north: number };

export const EUROPE_BOUNDS: LonLatBounds = { west: -11, south: 35, east: 32, north: 62 };

export function projectLongitude(longitude: number) {
  return ((longitude + 180) / 360) * TILE_SIZE;
}

export function projectLatitude(latitude: number) {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const sine = Math.sin((clamped * Math.PI) / 180);
  return (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * TILE_SIZE;
}

export function project(longitude: number, latitude: number): WorldPoint {
  return { x: projectLongitude(longitude), y: projectLatitude(latitude) };
}

export function unprojectX(x: number) {
  return (x / TILE_SIZE) * 360 - 180;
}

export function unprojectY(y: number) {
  return (Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / TILE_SIZE)) * 180) / Math.PI;
}

export function isValidCoordinate(longitude: number, latitude: number) {
  return (
    Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
  );
}

export function scaleOf(zoom: number) {
  return 2 ** zoom;
}

export function toScreen(camera: Camera, size: MapSize, point: WorldPoint): ScreenPoint {
  const scale = scaleOf(camera.zoom);
  return { x: (point.x - camera.x) * scale + size.width / 2, y: (point.y - camera.y) * scale + size.height / 2 };
}

export function toWorld(camera: Camera, size: MapSize, point: ScreenPoint): WorldPoint {
  const scale = scaleOf(camera.zoom);
  return { x: camera.x + (point.x - size.width / 2) / scale, y: camera.y + (point.y - size.height / 2) / scale };
}

export function minZoomFor(size: MapSize) {
  return Math.max(0, Math.log2(Math.max(1, Math.min(size.width, size.height)) / TILE_SIZE));
}

function clampRange(value: number, min: number, max: number) {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

export function clampZoom(zoom: number, size: MapSize) {
  return Math.min(MAX_ZOOM, Math.max(minZoomFor(size), zoom));
}

export function clampCamera(camera: Camera, size: MapSize): Camera {
  const zoom = clampZoom(camera.zoom, size);
  const scale = scaleOf(zoom);
  const halfWidth = size.width / 2 / scale;
  const halfHeight = size.height / 2 / scale;
  return {
    zoom,
    x: clampRange(camera.x, halfWidth, TILE_SIZE - halfWidth),
    y: clampRange(camera.y, halfHeight, TILE_SIZE - halfHeight),
  };
}

export function zoomAround(camera: Camera, size: MapSize, anchor: ScreenPoint, zoom: number): Camera {
  const target = clampZoom(zoom, size);
  const world = toWorld(camera, size, anchor);
  const scale = scaleOf(target);
  return clampCamera(
    {
      zoom: target,
      x: world.x - (anchor.x - size.width / 2) / scale,
      y: world.y - (anchor.y - size.height / 2) / scale,
    },
    size,
  );
}

export function panBy(camera: Camera, size: MapSize, dx: number, dy: number): Camera {
  const scale = scaleOf(camera.zoom);
  return clampCamera({ ...camera, x: camera.x + dx / scale, y: camera.y + dy / scale }, size);
}

export function worldBoundsOf(points: readonly WorldPoint[]): WorldBounds | null {
  if (points.length === 0) return null;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { x, y } of points) {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  return bounds;
}

export function lonLatToWorldBounds({ west, south, east, north }: LonLatBounds): WorldBounds {
  return {
    minX: projectLongitude(west),
    minY: projectLatitude(north),
    maxX: projectLongitude(east),
    maxY: projectLatitude(south),
  };
}

export function fitCamera(bounds: WorldBounds, size: MapSize, padding = FIT_PADDING, maxZoom = FIT_MAX_ZOOM): Camera {
  const inset = Math.min(padding, size.width / 4, size.height / 4);
  const width = Math.max(1, size.width - 2 * inset);
  const height = Math.max(1, size.height - 2 * inset);
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const zoomX = spanX > 0 ? Math.log2(width / spanX) : maxZoom;
  const zoomY = spanY > 0 ? Math.log2(height / spanY) : maxZoom;
  return clampCamera(
    { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2, zoom: Math.min(maxZoom, zoomX, zoomY) },
    size,
  );
}

export function visibleWorldBounds(camera: Camera, size: MapSize, margin = 0): WorldBounds {
  const scale = scaleOf(camera.zoom);
  const halfWidth = (size.width / 2 / scale) * (1 + 2 * margin);
  const halfHeight = (size.height / 2 / scale) * (1 + 2 * margin);
  return {
    minX: Math.max(0, camera.x - halfWidth),
    minY: Math.max(0, camera.y - halfHeight),
    maxX: Math.min(TILE_SIZE, camera.x + halfWidth),
    maxY: Math.min(TILE_SIZE, camera.y + halfHeight),
  };
}

export function worldToLonLatBounds({ minX, minY, maxX, maxY }: WorldBounds): LonLatBounds {
  return { west: unprojectX(minX), south: unprojectY(maxY), east: unprojectX(maxX), north: unprojectY(minY) };
}

export function boundsIntersect(left: WorldBounds, right: WorldBounds) {
  return left.minX < right.maxX && left.maxX > right.minX && left.minY < right.maxY && left.maxY > right.minY;
}

export function sameCamera(left: Camera, right: Camera) {
  return (
    Math.abs(left.zoom - right.zoom) < 1e-9 && Math.abs(left.x - right.x) < 1e-9 && Math.abs(left.y - right.y) < 1e-9
  );
}

export function interpolateCamera(from: Camera, to: Camera, progress: number): Camera {
  const zoom = from.zoom + (to.zoom - from.zoom) * progress;
  const weight =
    Math.abs(to.zoom - from.zoom) < 1e-6
      ? progress
      : (1 - scaleOf(from.zoom - zoom)) / (1 - scaleOf(from.zoom - to.zoom));
  return { zoom, x: from.x + (to.x - from.x) * weight, y: from.y + (to.y - from.y) * weight };
}
