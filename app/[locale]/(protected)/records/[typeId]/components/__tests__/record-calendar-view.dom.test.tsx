import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordsStore } from "../records.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({
  onDragStart: undefined as ((event: DragStartEvent) => void) | undefined,
  onDragEnd: undefined as ((event: DragEndEvent) => void) | undefined,
  draggables: [] as { id: string; disabled: boolean }[],
  droppables: [] as { id: string; disabled: boolean }[],
  wide: true,
}));

vi.mock("mobx-react-lite", () => ({ observer: <T,>(component: T) => component }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => spy.wide }));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formattingLocale: "en-GB", formatNumber: String }),
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  PopoverTrigger: ({ children }: { children: ReactNode }) => children,
  PopoverContent: () => null,
  PopoverHeader: ({ children }: { children: ReactNode }) => children,
  PopoverTitle: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/ui/segmented-control", () => ({
  SegmentedControl: ({ items }: { items: { value: string }[] }) =>
    createElement("div", { "data-modes": items.map((item) => item.value).join(",") }),
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragStart,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragStart: (event: DragStartEvent) => void;
    onDragEnd: (event: DragEndEvent) => void;
  }) => {
    spy.onDragStart = onDragStart;
    spy.onDragEnd = onDragEnd;
    return createElement("div", null, children);
  },
  DragOverlay: ({ children }: { children?: ReactNode }) => children ?? null,
  KeyboardSensor: function KeyboardSensor() {},
  MouseSensor: function MouseSensor() {},
  TouchSensor: function TouchSensor() {},
  closestCenter: () => [],
  pointerWithin: () => [],
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
  useDraggable: ({ id, disabled }: { id: string; disabled?: boolean }) => {
    spy.draggables.push({ id, disabled: Boolean(disabled) });
    return {
      attributes: { "aria-disabled": Boolean(disabled), "aria-roledescription": "draggable" },
      listeners: {},
      setNodeRef: () => undefined,
      isDragging: false,
    };
  },
  useDroppable: ({ id, disabled }: { id: string; disabled?: boolean }) => {
    spy.droppables.push({ id, disabled: Boolean(disabled) });
    return { setNodeRef: () => undefined, isOver: false };
  },
}));

import { RecordCalendarView } from "../record-calendar-view";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected the element to be rendered");
  return value;
}

const field = (id: string, valueType: "date" | "dateTime" | "select") => ({
  id,
  typeId: "deal",
  valueType,
  multiple: false,
  archived: false,
  label: id,
  options: valueType === "select" ? [{ id: "won", label: "Won", color: "success", attributes: [] }] : [],
});

function row(id: string, date: string): RecordRow {
  return {
    id,
    fields: [
      { fieldId: "close", result: { state: "value", value: { kind: "date", value: date } } },
      { fieldId: "stage", result: { state: "value", value: { kind: "select", value: "won" } } },
    ],
  } as unknown as RecordRow;
}

type FakeStore = Partial<RecordsStore> & { moveCalendarRecord: ReturnType<typeof vi.fn> };

function fakeStore(overrides: Partial<FakeStore> = {}): FakeStore {
  const items = [
    row("a", "2026-10-16"),
    row("b", "2026-10-16"),
    row("c", "2026-10-16"),
    row("d", "2026-10-16"),
    row("e", "2026-10-20"),
  ];
  return {
    items,
    calendar: { dateFieldId: "close", colorFieldId: "stage", mode: "month" },
    calendarFields: { start: field("close", "date"), end: null, color: field("stage", "select") } as never,
    calendarWindow: { from: "2026-09-28", to: "2026-11-01", timeZone: "Europe/Berlin" },
    calendarRange: { from: "2026-09-28", to: "2026-11-01", total: 5, truncated: false },
    calendarMode: "month",
    calendarFocusDate: "2026-10-18",
    calendarResultSeq: 1,
    isRefreshing: false,
    canMoveCalendarRecord: (record: RecordRow) => record.id !== "e",
    moveCalendarRecord: vi.fn().mockResolvedValue({ saved: true }),
    setCalendarDisplayMode: vi.fn(),
    setCalendarAnchor: vi.fn(),
    setViewOptions: vi.fn(),
    refreshQuery: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as FakeStore;
}

const roots = new Set<Root>();

function render(store: FakeStore, onOpenRecord = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  act(() => {
    root.render(
      createElement(RecordCalendarView, {
        store: store as unknown as RecordsStore,
        recordName: (record: RecordRow) => `Deal ${record.id}`,
        onOpenRecord,
      }),
    );
  });
  return { host, onOpenRecord };
}

function rangeStore(start: string, end: string, overrides: Partial<FakeStore> = {}) {
  return fakeStore({
    items: [
      {
        id: "r",
        fields: [
          { fieldId: "close", result: { state: "value", value: { kind: "date", value: start } } },
          { fieldId: "finish", result: { state: "value", value: { kind: "date", value: end } } },
        ],
      } as unknown as RecordRow,
    ],
    calendarFields: { start: field("close", "date"), end: field("finish", "date"), color: null } as never,
    ...overrides,
  });
}

function grabAt(host: HTMLElement, day: string) {
  const cell = must(host.querySelector<HTMLElement>(`[data-calendar-day="${day}"]`));
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: vi.fn(() => [must(host.querySelector('[data-calendar-entry="r"]')), cell, document.body]),
  });
  return new MouseEvent("mousedown", { clientX: 40, clientY: 40 });
}

async function drag(activatorEvent: Event, segmentStart: string, drop: string) {
  const active = { id: `r:${segmentStart}`, data: { current: { recordId: "r", segmentStart } } };
  await act(async () => {
    spy.onDragStart?.({ active, activatorEvent } as unknown as DragStartEvent);
    await Promise.resolve();
    spy.onDragEnd?.({
      active,
      activatorEvent,
      over: { id: drop, data: { current: { date: drop } } },
    } as unknown as DragEndEvent);
  });
}

beforeEach(() => {
  spy.onDragStart = undefined;
  spy.onDragEnd = undefined;
  spy.draggables = [];
  spy.droppables = [];
  spy.wide = true;
});

afterEach(() => {
  Reflect.deleteProperty(document, "elementsFromPoint");
  vi.unstubAllGlobals();
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.replaceChildren();
});

describe("record calendar view", () => {
  it("draws the month with three records per day and a +N more control", () => {
    const { host } = render(fakeStore());
    expect(host.querySelectorAll("[data-calendar-day]")).toHaveLength(35);
    const placed = [...host.querySelectorAll("[data-calendar-entry]")].map((entry) => [
      entry.getAttribute("data-calendar-entry"),
      entry.getAttribute("data-calendar-entry-start"),
    ]);
    expect(placed).toEqual([
      ["a", "2026-10-16"],
      ["b", "2026-10-16"],
      ["c", "2026-10-16"],
      ["e", "2026-10-20"],
    ]);
    expect(host.querySelector('[data-calendar-more="2026-10-16"]')?.textContent).toBe("DataView.calendar.more:1");
    expect(host.querySelector('[data-calendar-entry="a"]')?.getAttribute("style")).toContain("var(--success) 20%");
    expect(host.querySelector("[data-modes]")?.getAttribute("data-modes")).toBe("month,week,agenda");
  });

  it("moves a record to the day it is dropped on through the store", async () => {
    const store = fakeStore();
    render(store);
    expect(spy.droppables.every((droppable) => !droppable.disabled)).toBe(true);
    await act(async () => {
      await Promise.resolve();
      spy.onDragEnd?.({
        active: { id: "a:2026-10-16", data: { current: { recordId: "a", segmentStart: "2026-10-16" } } },
        over: { id: "2026-10-22", data: { current: { date: "2026-10-22" } } },
      } as unknown as DragEndEvent);
    });
    expect(store.moveCalendarRecord).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "2026-10-22");
  });

  it("ignores a drop on the same day and keeps read-only records out of drag and drop", async () => {
    const store = fakeStore();
    const { host, onOpenRecord } = render(store);
    await act(async () => {
      await Promise.resolve();
      spy.onDragEnd?.({
        active: { id: "a:2026-10-16", data: { current: { recordId: "a", segmentStart: "2026-10-16" } } },
        over: { id: "2026-10-16", data: { current: { date: "2026-10-16" } } },
      } as unknown as DragEndEvent);
    });
    expect(store.moveCalendarRecord).not.toHaveBeenCalled();
    expect(spy.draggables.find((draggable) => draggable.id.startsWith("e:"))?.disabled).toBe(true);
    const readOnly = must(host.querySelector<HTMLElement>('[data-calendar-entry="e"]'));
    expect(readOnly.hasAttribute("aria-disabled")).toBe(false);
    act(() => readOnly.click());
    expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: "e" }), readOnly);
  });

  it("moves a range by the distance from the day it was grabbed on, not from its first day", async () => {
    const store = rangeStore("2026-10-05", "2026-10-09");
    const { host } = render(store);
    await drag(grabAt(host, "2026-10-09"), "2026-10-05", "2026-10-09");
    expect(store.moveCalendarRecord).not.toHaveBeenCalled();
    await drag(grabAt(host, "2026-10-09"), "2026-10-05", "2026-10-10");
    expect(store.moveCalendarRecord).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r" }), "2026-10-06");
    await drag(grabAt(host, "2026-10-08"), "2026-10-05", "2026-10-01");
    expect(store.moveCalendarRecord).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r" }), "2026-09-28");
  });

  it("moves a range that continues from an earlier week by the grabbed day of its later segment", async () => {
    const store = rangeStore("2026-10-08", "2026-10-14");
    const { host } = render(store);
    await drag(grabAt(host, "2026-10-14"), "2026-10-12", "2026-10-16");
    expect(store.moveCalendarRecord).toHaveBeenCalledWith(expect.objectContaining({ id: "r" }), "2026-10-10");
  });

  it("moves a range picked up with the keyboard from the day its segment starts", async () => {
    vi.stubGlobal("requestAnimationFrame", () => 0);
    const store = rangeStore("2026-10-05", "2026-10-09");
    render(store);
    await drag(new KeyboardEvent("keydown", { code: "Space" }), "2026-10-05", "2026-10-07");
    expect(store.moveCalendarRecord).toHaveBeenCalledWith(expect.objectContaining({ id: "r" }), "2026-10-07");
  });

  it("shows a timed entry's start time only on its first agenda day", () => {
    spy.wide = false;
    const store = fakeStore({
      items: [
        {
          id: "t",
          fields: [
            { fieldId: "at", result: { state: "value", value: { kind: "dateTime", value: "2026-10-16T07:00:00Z" } } },
            {
              fieldId: "until",
              result: { state: "value", value: { kind: "dateTime", value: "2026-10-18T09:00:00Z" } },
            },
          ],
        } as unknown as RecordRow,
      ],
      calendar: { dateFieldId: "at", endDateFieldId: "until", mode: "agenda" },
      calendarFields: { start: field("at", "dateTime"), end: field("until", "dateTime"), color: null } as never,
      calendarMode: "agenda",
      calendarWindow: { from: "2026-10-01", to: "2026-10-31", timeZone: "Europe/Berlin" },
      calendarRange: { from: "2026-10-01", to: "2026-10-31", total: 1, truncated: false },
    });
    const { host } = render(store);
    const days = [...host.querySelectorAll("[data-calendar-agenda-day]")].map((day) => [
      day.getAttribute("data-calendar-agenda-day"),
      day.querySelector("[data-calendar-entry]")?.textContent,
    ]);
    expect(days).toEqual([
      ["2026-10-16", "9:00Deal t"],
      ["2026-10-17", "Deal t"],
      ["2026-10-18", "Deal t"],
    ]);
  });

  it("shows the agenda on phones and a notice when the window holds more records than it shows", () => {
    spy.wide = false;
    const store = fakeStore({
      calendarMode: "agenda",
      calendarWindow: { from: "2026-10-01", to: "2026-10-31", timeZone: "Europe/Berlin" },
      calendarRange: { from: "2026-10-01", to: "2026-10-31", total: 900, truncated: true },
    });
    const { host } = render(store);
    expect(store.setCalendarDisplayMode).toHaveBeenCalledWith("agenda");
    expect(host.querySelector("[data-modes]")).toBeNull();
    expect(
      [...host.querySelectorAll("[data-calendar-agenda-day]")].map((day) =>
        day.getAttribute("data-calendar-agenda-day"),
      ),
    ).toEqual(["2026-10-16", "2026-10-20"]);
    expect(host.querySelector("[data-calendar-truncated]")?.textContent).toBe("DataView.calendar.truncated:5,900");
    expect(spy.droppables).toEqual([]);
  });

  it("asks for the calendar window when the loaded records belong to another range", () => {
    const store = fakeStore({ calendarRange: null });
    render(store);
    expect(store.refreshQuery).toHaveBeenCalledOnce();
  });

  it("steps by month and returns to today", () => {
    const store = fakeStore();
    const { host } = render(store);
    act(() => must(host.querySelector<HTMLElement>('[aria-label="DataView.calendar.nextMonth"]')).click());
    expect(store.setCalendarAnchor).toHaveBeenCalledWith("2026-11-18");
    act(() => must(host.querySelector<HTMLElement>('[aria-label="DataView.calendar.previousMonth"]')).click());
    expect(store.setCalendarAnchor).toHaveBeenCalledWith("2026-09-18");
  });
});
