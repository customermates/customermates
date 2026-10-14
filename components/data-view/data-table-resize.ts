import { resizeKeyboardStep, roundResizeSize as roundWidth } from "@/components/shared/resize-interaction";

export const MIN_COLUMN_WIDTH = 80;

export type ColumnWidthBounds = { minWidth: number; maxWidth: number };

const TABLE_COLUMN_BOUNDS: ColumnWidthBounds = { minWidth: MIN_COLUMN_WIDTH, maxWidth: Number.POSITIVE_INFINITY };

function clampWidth(width: number, bounds: ColumnWidthBounds) {
  return roundWidth(Math.min(bounds.maxWidth, Math.max(bounds.minWidth, width)));
}

export function beginColumnResize({
  columnId,
  pointerId,
  pointerType,
  clientX,
  renderedWidth,
  bounds = TABLE_COLUMN_BOUNDS,
}: {
  columnId: string;
  pointerId: number;
  pointerType: string;
  clientX: number;
  renderedWidth: number;
  bounds?: ColumnWidthBounds;
}) {
  const width = roundWidth(renderedWidth);

  return {
    columnId,
    bounds,
    pointerId,
    pointerType,
    startClientX: clientX,
    startWidth: width,
    currentWidth: width,
    hasMoved: false,
  };
}

export type ColumnResizeSession = ReturnType<typeof beginColumnResize>;

export function updateColumnResize(session: ColumnResizeSession, clientX: number) {
  const delta = clientX - session.startClientX;
  const currentWidth = clampWidth(session.startWidth + delta, session.bounds);

  return {
    ...session,
    currentWidth,
    hasMoved: session.hasMoved || delta !== 0,
  };
}

export function shouldCommitColumnResize(session: ColumnResizeSession) {
  return session.hasMoved && session.currentWidth !== session.startWidth;
}

export function keyboardColumnWidth(
  renderedWidth: number,
  key: string,
  largeStep = false,
  bounds: ColumnWidthBounds = TABLE_COLUMN_BOUNDS,
) {
  const step = resizeKeyboardStep(largeStep);

  if (key === "ArrowLeft") return clampWidth(renderedWidth - step, bounds);
  if (key === "ArrowRight") return clampWidth(renderedWidth + step, bounds);
  if (key === "Home") return bounds.minWidth;
  if (key === "End" && Number.isFinite(bounds.maxWidth)) return bounds.maxWidth;
  return undefined;
}

export function withoutColumnWidth(widths: Record<string, number>, columnId: string) {
  return Object.fromEntries(Object.entries(widths).filter(([uid]) => uid !== columnId));
}

export function columnResizeLabel(columnId: string, header: unknown, configuredLabel?: string) {
  if (typeof header === "string" && header.trim()) return header;
  if (configuredLabel?.trim()) return configuredLabel;
  return columnId;
}
