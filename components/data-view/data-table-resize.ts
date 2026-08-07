export const MIN_COLUMN_WIDTH = 80;
export const COLUMN_RESIZE_KEYBOARD_STEP = 10;
export const COLUMN_RESIZE_KEYBOARD_LARGE_STEP = 30;
export const TOUCH_RESET_DOUBLE_TAP_MS = 400;

export type ColumnResizeSession = {
  columnId: string;
  pointerId: number;
  pointerType: string;
  startClientX: number;
  startWidth: number;
  currentWidth: number;
  hasMoved: boolean;
};

function roundWidth(width: number): number {
  return Math.round(width * 100) / 100;
}

export function beginColumnResize(args: {
  columnId: string;
  pointerId: number;
  pointerType: string;
  clientX: number;
  renderedWidth: number;
}): ColumnResizeSession {
  const renderedWidth = roundWidth(args.renderedWidth);

  return {
    columnId: args.columnId,
    pointerId: args.pointerId,
    pointerType: args.pointerType,
    startClientX: args.clientX,
    startWidth: renderedWidth,
    currentWidth: renderedWidth,
    hasMoved: false,
  };
}

export function updateColumnResize(session: ColumnResizeSession, clientX: number): ColumnResizeSession {
  const delta = clientX - session.startClientX;
  const currentWidth = roundWidth(Math.max(MIN_COLUMN_WIDTH, session.startWidth + delta));

  return {
    ...session,
    currentWidth,
    hasMoved: session.hasMoved || delta !== 0,
  };
}

export function shouldCommitColumnResize(session: ColumnResizeSession): boolean {
  return session.hasMoved && session.currentWidth !== session.startWidth;
}

export function keyboardColumnWidth(renderedWidth: number, key: string, largeStep = false): number | undefined {
  const step = largeStep ? COLUMN_RESIZE_KEYBOARD_LARGE_STEP : COLUMN_RESIZE_KEYBOARD_STEP;

  if (key === "ArrowLeft") return roundWidth(Math.max(MIN_COLUMN_WIDTH, renderedWidth - step));
  if (key === "ArrowRight") return roundWidth(renderedWidth + step);
  if (key === "Home") return MIN_COLUMN_WIDTH;
  return undefined;
}

export function withoutColumnWidth(widths: Record<string, number>, columnId: string): Record<string, number> {
  return Object.fromEntries(Object.entries(widths).filter(([uid]) => uid !== columnId));
}

export function isTouchResetDoubleTap(previousTapAt: number | undefined, currentTapAt: number): boolean {
  if (previousTapAt === undefined) return false;
  const elapsed = currentTapAt - previousTapAt;
  return elapsed > 0 && elapsed <= TOUCH_RESET_DOUBLE_TAP_MS;
}

export function columnResizeLabel(columnId: string, header: unknown, configuredLabel?: string): string {
  if (typeof header === "string" && header.trim()) return header;
  if (configuredLabel?.trim()) return configuredLabel;
  return columnId;
}
