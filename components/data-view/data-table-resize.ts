import { resizeKeyboardStep, roundResizeSize as roundWidth } from "@/components/shared/resize-interaction";

export const MIN_COLUMN_WIDTH = 80;

export function beginColumnResize({
  columnId,
  pointerId,
  pointerType,
  clientX,
  renderedWidth,
}: {
  columnId: string;
  pointerId: number;
  pointerType: string;
  clientX: number;
  renderedWidth: number;
}) {
  const width = roundWidth(renderedWidth);

  return {
    columnId,
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
  const currentWidth = roundWidth(Math.max(MIN_COLUMN_WIDTH, session.startWidth + delta));

  return {
    ...session,
    currentWidth,
    hasMoved: session.hasMoved || delta !== 0,
  };
}

export function shouldCommitColumnResize(session: ColumnResizeSession) {
  return session.hasMoved && session.currentWidth !== session.startWidth;
}

export function keyboardColumnWidth(renderedWidth: number, key: string, largeStep = false) {
  const step = resizeKeyboardStep(largeStep);

  if (key === "ArrowLeft") return roundWidth(Math.max(MIN_COLUMN_WIDTH, renderedWidth - step));
  if (key === "ArrowRight") return roundWidth(renderedWidth + step);
  if (key === "Home") return MIN_COLUMN_WIDTH;
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
