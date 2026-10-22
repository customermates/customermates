"use client";

import type { ReactNode } from "react";
import type {
  CollisionDetection,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { CalendarEdge, CalendarEdit } from "@/features/record-calendar/calendar-entries";
import type { RecordsStore } from "./records.store";
import type { CalendarItem } from "./record-calendar-layout";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { createContext, useContext, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useCalendarEntryDateLabel } from "@/components/records/calendar-entry-tooltip";
import { useRecordValueFormat } from "@/components/records/record-value";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { addCalendarDays, calendarDateInstant, calendarDayDifference } from "@/features/record-calendar/calendar-date";
import { editCalendarEntry } from "@/features/record-calendar/calendar-entries";
import { CALENDAR_KEY_STEPS } from "@/features/record-calendar/calendar-window";

export type CalendarDragStore = Pick<
  RecordsStore,
  "canMoveCalendarRecord" | "canResizeCalendarRecord" | "moveCalendarRecord"
>;

type DragData = { recordId: string; edge: CalendarEdge; day: CalendarDate };
type DayRef = { current: CalendarDate | null };
type DragState = {
  pending: ReadonlyMap<string, CalendarEdit>;
  wasDragged: () => boolean;
};

const MINUTE_STEP = 15;
const CLICK_AFTER_DRAG_MS = 300;
const KEYBOARD_CODES = { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] };
const NO_PENDING: ReadonlyMap<string, CalendarEdit> = new Map();
const CalendarDragContext = createContext<DragState>({ pending: NO_PENDING, wasDragged: () => false });

export function useCalendarDrag() {
  return useContext(CalendarDragContext);
}

function collisionDetection(keyboardDay: DayRef): CollisionDetection {
  return (args) => {
    if (!args.pointerCoordinates) {
      const day = keyboardDay.current;
      return day && args.droppableContainers.some((container) => container.id === day)
        ? [{ id: day }]
        : closestCenter(args);
    }
    const within = pointerWithin(args);
    return within.length ? within : closestCenter(args);
  };
}

function keyboardCoordinates(keyboardDay: DayRef): KeyboardCoordinateGetter {
  return (event, { currentCoordinates, context }) => {
    const step = CALENDAR_KEY_STEPS[event.code];
    const current = keyboardDay.current;
    if (step === undefined || !current) return;
    const next = addCalendarDays(current, step);
    const from = context.droppableRects.get(current);
    const target = context.droppableRects.get(next);
    if (!from || !target) return;
    event.preventDefault();
    keyboardDay.current = next;
    return { x: currentCoordinates.x + target.left - from.left, y: currentCoordinates.y + target.top - from.top };
  };
}

function dayUnderPointer(event: Event): CalendarDate | null {
  const point = event instanceof MouseEvent ? event : "touches" in event ? (event as TouchEvent).touches[0] : undefined;
  if (!point) return null;
  const cell = document
    .elementsFromPoint(point.clientX, point.clientY)
    .find((element): element is HTMLElement => element instanceof HTMLElement && Boolean(element.dataset.calendarDay));
  return cell?.dataset.calendarDay ?? null;
}

export function useCalendarDraggable({
  id,
  recordId,
  edge,
  day,
  disabled,
}: DragData & { id: string; disabled: boolean }) {
  return useDraggable({ id: `${id}:${edge}`, data: { recordId, edge, day } satisfies DragData, disabled });
}

export function CalendarResizeHandle({
  id,
  recordId,
  edge,
  day,
  vertical = false,
}: {
  id: string;
  recordId: string;
  edge: "start" | "end";
  day: CalendarDate;
  vertical?: boolean;
}) {
  const { listeners, setNodeRef } = useCalendarDraggable({ id, recordId, edge, day, disabled: false });
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      aria-hidden
      className={cn(
        "absolute z-10 touch-none after:absolute after:rounded-full after:bg-current after:opacity-0 after:transition-opacity group-hover/entry:after:opacity-40 motion-reduce:after:transition-none",
        vertical
          ? "inset-x-0 h-2 cursor-ns-resize after:inset-x-1/3 after:h-0.5"
          : "inset-y-0 w-2 cursor-ew-resize after:inset-y-1 after:w-0.5",
        vertical && (edge === "start" ? "top-0 after:top-0.5" : "bottom-0 after:bottom-0.5"),
        !vertical && (edge === "start" ? "left-0 after:left-0.5" : "right-0 after:right-0.5"),
      )}
      data-calendar-resize={edge}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

export function CalendarDrag({
  store,
  items,
  timeZone,
  pixelsPerMinute,
  children,
}: {
  store: CalendarDragStore;
  items: readonly CalendarItem[];
  timeZone: string;
  pixelsPerMinute?: number;
  children: ReactNode;
}) {
  const t = useTranslations();
  const contextId = useId();
  const format = useRecordValueFormat();
  const dateLabel = useCalendarEntryDateLabel(timeZone, true);
  const [pending, setPending] = useState<ReadonlyMap<string, CalendarEdit>>(NO_PENDING);
  const [active, setActive] = useState<DragData | null>(null);
  const grabDay = useRef<CalendarDate | null>(null);
  const keyboardDay = useRef<CalendarDate | null>(null);
  const endedAt = useRef(0);
  const pointerDrag = useRef(false);
  const dragged = useRef<DragData | null>(null);
  const [collisions] = useState(() => collisionDetection(keyboardDay));
  const [coordinateGetter] = useState(() => keyboardCoordinates(keyboardDay));
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter, keyboardCodes: KEYBOARD_CODES }),
  );
  const byId = new Map(items.map((item) => [item.record.id, item]));
  const fullDate = (date: string) => format.date(calendarDateInstant(date), { dateStyle: "full", timeZone: "UTC" });

  const dataOf = (event: DragMoveEvent | DragEndEvent) =>
    dragged.current ?? (event.active.data.current as DragData | undefined) ?? null;

  const editOf = (event: DragMoveEvent | DragEndEvent): CalendarEdit | null => {
    const data = dataOf(event);
    if (!data || !event.over) return null;
    const days = calendarDayDifference(grabDay.current ?? data.day, String(event.over.id));
    const minutes = pixelsPerMinute ? Math.round(event.delta.y / pixelsPerMinute / MINUTE_STEP) * MINUTE_STEP : 0;
    return { edge: data.edge, days, minutes };
  };

  const show = (recordId: string, edit: CalendarEdit | null) =>
    setPending((current) => {
      const previous = current.get(recordId);
      if (!edit) {
        if (!previous) return current;
        const next = new Map(current);
        next.delete(recordId);
        return next;
      }
      if (previous && previous.days === edit.days && previous.minutes === edit.minutes && previous.edge === edit.edge)
        return current;
      return new Map(current).set(recordId, edit);
    });

  function start(event: DragStartEvent) {
    const data = event.active.data.current as DragData | undefined;
    if (!data) return;
    const keyboard = event.activatorEvent instanceof KeyboardEvent;
    grabDay.current = (!keyboard && event.activatorEvent ? dayUnderPointer(event.activatorEvent) : null) ?? data.day;
    keyboardDay.current = keyboard ? data.day : null;
    pointerDrag.current = !keyboard;
    dragged.current = data;
    setActive(data);
  }

  function finish() {
    grabDay.current = null;
    keyboardDay.current = null;
    if (pointerDrag.current) endedAt.current = Date.now();
    pointerDrag.current = false;
    dragged.current = null;
    setActive(null);
  }

  function cancel() {
    if (active) show(active.recordId, null);
    finish();
  }

  async function drop(event: DragEndEvent) {
    const data = dataOf(event);
    const edit = editOf(event);
    finish();
    const item = data && byId.get(data.recordId);
    if (!data || !item || !edit || (edit.days === 0 && edit.minutes === 0)) {
      if (data) show(data.recordId, null);
      return;
    }
    show(data.recordId, edit);
    try {
      const outcome = await store.moveCalendarRecord(item.record, edit);
      if (!outcome.saved && outcome.invalid?.length) toastZodErrorTree({ errors: outcome.invalid });
    } finally {
      show(data.recordId, null);
    }
    if (event.activatorEvent instanceof KeyboardEvent) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-calendar-entry="${CSS.escape(data.recordId)}"]`)?.focus(),
      );
    }
  }

  const activeItem = active && byId.get(active.recordId);
  const preview = activeItem && editCalendarEntry(activeItem.entry, pending.get(activeItem.record.id), timeZone);
  return (
    <CalendarDragContext.Provider
      value={{ pending, wasDragged: () => Date.now() - endedAt.current < CLICK_AFTER_DRAG_MS }}
    >
      <DndContext
        accessibility={{
          screenReaderInstructions: { draggable: t("DataView.calendar.keyboardInstructions") },
          announcements: {
            onDragStart: () => t("DataView.calendar.pickedUp"),
            onDragOver: ({ over }) =>
              over ? t("DataView.calendar.moveTarget", { date: fullDate(String(over.id)) }) : undefined,
            onDragEnd: ({ over }) =>
              over
                ? t("DataView.calendar.moveRequested", { date: fullDate(String(over.id)) })
                : t("DataView.calendar.moveCancelled"),
            onDragCancel: () => t("DataView.calendar.moveCancelled"),
          },
        }}
        collisionDetection={collisions}
        id={contextId}
        sensors={sensors}
        onDragCancel={cancel}
        onDragEnd={(event) => runUserAction(() => drop(event))}
        onDragMove={(event) => {
          const data = dataOf(event);
          if (data) show(data.recordId, editOf(event));
        }}
        onDragStart={start}
      >
        {children}

        {active &&
          preview &&
          createPortal(
            <DragOverlay dropAnimation={null}>
              <div className="pointer-events-none relative size-full" data-calendar-drag-preview="">
                <span
                  className={cn(
                    "absolute bottom-full mb-1.5 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs font-medium tabular-nums text-popover-foreground shadow-md",
                    active.edge === "end" ? "right-0" : "left-0",
                  )}
                >
                  {dateLabel(preview)}
                </span>
              </div>
            </DragOverlay>,
            document.body,
          )}
      </DndContext>
    </CalendarDragContext.Provider>
  );
}
