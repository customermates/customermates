export const MIN_COLUMN_WIDTH = 80;
const COLUMN_RESIZE_KEYBOARD_STEP = 10;
const COLUMN_RESIZE_KEYBOARD_LARGE_STEP = 30;
const TOUCH_RESET_DOUBLE_TAP_MS = 400;

const roundWidth = (width: number) => Math.round(width * 100) / 100;

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
  const step = largeStep ? COLUMN_RESIZE_KEYBOARD_LARGE_STEP : COLUMN_RESIZE_KEYBOARD_STEP;

  if (key === "ArrowLeft") return roundWidth(Math.max(MIN_COLUMN_WIDTH, renderedWidth - step));
  if (key === "ArrowRight") return roundWidth(renderedWidth + step);
  if (key === "Home") return MIN_COLUMN_WIDTH;
  return undefined;
}

export function withoutColumnWidth(widths: Record<string, number>, columnId: string) {
  return Object.fromEntries(Object.entries(widths).filter(([uid]) => uid !== columnId));
}

export function isTouchResetDoubleTap(previousTapAt: number | undefined, currentTapAt: number) {
  if (previousTapAt === undefined) return false;
  const elapsed = currentTapAt - previousTapAt;
  return elapsed > 0 && elapsed <= TOUCH_RESET_DOUBLE_TAP_MS;
}

export function columnResizeLabel(columnId: string, header: unknown, configuredLabel?: string) {
  if (typeof header === "string" && header.trim()) return header;
  if (configuredLabel?.trim()) return configuredLabel;
  return columnId;
}
