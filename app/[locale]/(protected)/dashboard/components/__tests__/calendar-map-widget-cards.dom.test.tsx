import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RecordDisplayField } from "@/features/records/record-display-field.schema";
import type {
  CalendarWidgetData,
  CalendarWidgetItem,
  CalendarWidgetQuery,
} from "@/features/widget/record-calendar-widget.schema";
import type { MapWidgetData, MapWidgetPoint, MapWidgetQuery } from "@/features/widget/record-map-widget.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const spy = vi.hoisted(() => ({ mapProps: null as Record<string, unknown> | null, open: vi.fn() }));

vi.mock("mobx-react-lite", () => ({ observer: <T,>(component: T) => component }));
vi.mock("next-intl", () => {
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key;
  t.rich = (key: string) => key;
  return { useLocale: () => "en", useTranslations: () => t };
});
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ recordWorkspaceStore: { open: spy.open } }),
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...props }, children),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formattingLocale: "en-GB", formatNumber: String }),
}));
vi.mock("@/components/shared/use-navigate-to-href", () => ({ useNavigateToHref: () => vi.fn() }));
vi.mock("@/components/shared/truncated-text", () => ({
  TruncatedText: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("@/components/records/record-value", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  RecordValue: ({ result }: { result: { state: string; value?: { value: string } } }) =>
    createElement("span", { "data-amount": "" }, result.state === "value" ? result.value?.value : "-"),
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) =>
    createElement("div", { "data-open": open ? "" : undefined, onClickCapture: () => onOpenChange?.(!open) }, children),
  PopoverTrigger: ({ children }: { children: ReactNode }) => children,
  PopoverContent: ({ children }: { children: ReactNode }) => createElement("div", { "data-popover": "" }, children),
  PopoverHeader: ({ children }: { children: ReactNode }) => children,
  PopoverTitle: ({ children }: { children: ReactNode }) => children,
  PopoverDescription: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/dynamic", () => ({
  default: () => (props: Record<string, unknown>) => {
    spy.mapProps = props;
    return createElement("div", { "data-map-view": "" });
  },
}));

import { RecordCalendarWidgetCard } from "../record-calendar-widget-card";
import { RecordMapWidgetCard } from "../record-map-widget-card";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected the element to be rendered");
  return value;
}

const DATE_FIELD = "00000000-0000-4000-8000-000000000001";
const AMOUNT_FIELD = "00000000-0000-4000-8000-000000000002";
const fields: RecordDisplayField[] = [
  { id: DATE_FIELD, label: "Close date", valueType: "date", options: [] },
  { id: AMOUNT_FIELD, label: "Value", valueType: "currency", options: [] },
];
const decimal = (value: string) => ({ state: "value", value: { kind: "decimal", value, currency: "EUR" } }) as const;

function item(id: string, date: string, amount: string | null = null): CalendarWidgetItem {
  return {
    record: { typeId: "deal", recordId: id },
    title: { state: "value", value: { kind: "text", value: `Deal ${id}` } },
    date,
    value: { state: "value", value: { kind: "date", value: date } },
    amount: amount === null ? null : decimal(amount),
  };
}

function query(overrides: Partial<CalendarWidgetQuery> = {}): CalendarWidgetQuery {
  return {
    source: { typeId: "deal", filters: [], relationships: [] },
    dateFieldId: DATE_FIELD,
    layout: "upcoming",
    timeZone: "Europe/Berlin",
    days: 14,
    showOverdue: true,
    amountFieldId: AMOUNT_FIELD,
    aggregation: "count",
    ...overrides,
  } as CalendarWidgetQuery;
}

function data(overrides: Partial<CalendarWidgetData> = {}): CalendarWidgetData {
  return {
    schemaRevision: 1,
    today: "2026-10-18",
    window: { from: "2026-10-18", to: "2026-10-31" },
    items: [item("a", "2026-10-20", "100"), item("b", "2026-11-02", "50")],
    overdue: [item("late", "2026-10-08")],
    overdueCount: 3,
    truncated: false,
    days: [],
    total: { count: 2, result: decimal("150") },
    ...overrides,
  };
}

const roots = new Set<Root>();
function render(element: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  act(() => root.render(element));
  return host;
}

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.replaceChildren();
  spy.mapProps = null;
});

describe("upcoming calendar widget", () => {
  it("lists overdue records first, then the next days with month headings and amounts", () => {
    const host = render(
      createElement(RecordCalendarWidgetCard, {
        name: "Closing soon",
        calendarQuery: query(),
        displayOptions: { showFilters: true },
        status: "ready",
        data: data(),
        fields,
        listLabels: { label: "Deal", pluralLabel: "Deals" },
        loadWindow: vi.fn(),
        recordHref: (ref) => `/records/${ref.typeId}/${ref.recordId}`,
      }),
    );
    expect(host.textContent).toContain("RecordCalendarWidgets.overdueCount:3");
    const overdue = must(host.querySelector('[data-calendar-section="overdue"]'));
    expect(overdue.querySelector('[data-calendar-item="late"]')?.hasAttribute("data-overdue")).toBe(true);
    expect(overdue.textContent).toContain("RecordCalendarWidgets.overdueBy:10");
    expect(overdue.textContent).toContain("RecordCalendarWidgets.moreOverdue:2");
    const upcoming = must(host.querySelector('[data-calendar-section="upcoming"]'));
    expect(
      [...upcoming.querySelectorAll("[data-calendar-item]")].map((row) => row.getAttribute("data-calendar-item")),
    ).toEqual(["a", "b"]);
    expect(upcoming.querySelector('[data-calendar-month="2026-11"]')).not.toBeNull();
    expect([...upcoming.querySelectorAll("[data-amount]")].map((amount) => amount.textContent)).toEqual(["100", "50"]);
    const link = must(host.querySelector<HTMLAnchorElement>('[data-calendar-item="a"] a'));
    expect(link.getAttribute("href")).toBe("/records/deal/a");
    spy.open.mockClear();
    const stayOnPage = (event: Event) => event.preventDefault();
    document.addEventListener("click", stayOnPage);
    act(() => {
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
    });
    document.removeEventListener("click", stayOnPage);
    expect(spy.open).not.toHaveBeenCalled();
    act(() => link.click());
    expect(spy.open).toHaveBeenCalledWith({ typeId: "deal", recordId: "a" }, link);
    expect(host.querySelector('[data-slot="widget-subtitle"]')?.textContent).toContain("Deals · Close date");
  });

  it("says when nothing is due and when the widget is unavailable", () => {
    const empty = render(
      createElement(RecordCalendarWidgetCard, {
        name: "Nothing",
        calendarQuery: query({ amountFieldId: null }),
        displayOptions: { showFilters: false },
        status: "ready",
        data: data({ items: [], overdue: [], overdueCount: 0 }),
        fields,
        loadWindow: vi.fn(),
      }),
    );
    expect(empty.querySelector('[data-slot="widget-empty"]')?.textContent).toBe("RecordCalendarWidgets.noUpcoming:14");
    expect(empty.querySelector('[data-slot="widget-subtitle"]')).toBeNull();
    const unavailable = render(
      createElement(RecordCalendarWidgetCard, {
        name: "Broken",
        calendarQuery: query(),
        displayOptions: { showFilters: false },
        status: "unavailable",
        data: null,
        fields,
        loadWindow: vi.fn(),
      }),
    );
    expect(unavailable.textContent).toContain("RecordCalendarWidgets.unavailable");
  });
});

describe("month overview widget", () => {
  const month = data({
    window: { from: "2026-10-01", to: "2026-10-31" },
    items: [item("a", "2026-10-12", "400"), item("b", "2026-10-16", "100")],
    overdue: [],
    overdueCount: 0,
    days: [
      { date: "2026-10-12", count: 1, result: decimal("400") },
      { date: "2026-10-16", count: 1, result: decimal("100") },
    ],
    total: { count: 2, result: decimal("500") },
  });

  it("colours the days by their sum, opens a day's records and loads the next month", async () => {
    const next = data({
      window: { from: "2026-11-01", to: "2026-11-30" },
      items: [],
      overdue: [],
      overdueCount: 0,
      days: [],
      total: { count: 0, result: decimal("0") },
    });
    const loadWindow = vi.fn().mockResolvedValue({ data: next, fields });
    const host = render(
      createElement(RecordCalendarWidgetCard, {
        name: "Closing this month",
        calendarQuery: query({ layout: "month", aggregation: "sum" }),
        displayOptions: { showFilters: true },
        status: "ready",
        data: month,
        fields,
        loadWindow,
        recordHref: (ref) => `/records/${ref.typeId}/${ref.recordId}`,
      }),
    );
    expect(host.querySelectorAll("[data-calendar-day]")).toHaveLength(31);
    expect(host.querySelector('[data-calendar-day="2026-10-12"]')?.getAttribute("data-heat")).toBe("4");
    expect(host.querySelector('[data-calendar-day="2026-10-16"]')?.getAttribute("data-heat")).toBe("1");
    expect(host.querySelector('[data-calendar-day="2026-10-13"]')?.getAttribute("data-heat")).toBe("0");
    expect(host.querySelector('[data-calendar-day="2026-10-18"]')?.hasAttribute("data-today")).toBe(true);
    expect(host.querySelector('[data-calendar-day="2026-10-18"]')?.getAttribute("tabindex")).toBe("0");
    expect(host.textContent).toContain("RecordCalendarWidgets.sumTotal");

    await act(async () => {
      must(host.querySelector<HTMLElement>('[data-calendar-day="2026-10-12"]')).click();
      await Promise.resolve();
    });
    const records = host.querySelector('[data-calendar-day-records="2026-10-12"]');
    const link = must(records?.querySelector("a"));
    expect(link.getAttribute("href")).toBe("/records/deal/a");
    expect(loadWindow).not.toHaveBeenCalled();
    spy.open.mockClear();
    const day = host.querySelector('[data-calendar-day="2026-10-12"]');
    act(() => link.click());
    expect(spy.open).toHaveBeenCalledWith({ typeId: "deal", recordId: "a" }, link, day);

    await act(async () => {
      must(host.querySelector<HTMLElement>('[aria-label="RecordCalendarWidgets.nextMonth"]')).click();
      await Promise.resolve();
    });
    expect(loadWindow).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-30" });
    expect(host.querySelector('[data-calendar-layout="month"]')?.getAttribute("data-calendar-month")).toBe(
      "2026-11-01",
    );
    expect(host.querySelectorAll("[data-calendar-day]")).toHaveLength(30);
  });
});

describe("map widget", () => {
  const point = (id: string, color: string | null): MapWidgetPoint => ({
    record: { typeId: "organization", recordId: id },
    title: { state: "value", value: { kind: "text", value: `Org ${id}` } },
    lat: 52.5,
    lon: 13.4,
    precision: id === "b" ? "postcode" : "address",
    address: "Alexanderplatz 1, 10178 Berlin",
    color,
    size: null,
    detail: null,
  });
  const COLOR_FIELD = "00000000-0000-4000-8000-000000000003";
  const mapQuery: MapWidgetQuery = {
    source: { typeId: "organization", filters: [], relationships: [] },
    addressFieldId: DATE_FIELD,
    colorFieldId: COLOR_FIELD,
    sizeFieldId: null,
    detailFieldId: null,
  };
  const mapFields: RecordDisplayField[] = [
    { id: DATE_FIELD, label: "Address", valueType: "address", options: [] },
    {
      id: COLOR_FIELD,
      label: "Segment",
      valueType: "select",
      options: [{ id: "smb", label: "SMB", color: "success" }],
    },
  ];

  function renderMap(mapData: MapWidgetData, openRecords = true) {
    return render(
      createElement(RecordMapWidgetCard, {
        name: "Customers",
        openRecords,
        mapQuery,
        displayOptions: { showFilters: true },
        status: "ready",
        data: mapData,
        fields: mapFields,
        listLabels: { label: "Organization", pluralLabel: "Organizations" },
      }),
    );
  }

  it("passes coloured points to the lazy map, with a legend and a hint for records without a location", () => {
    const host = renderMap({
      schemaRevision: 1,
      points: [point("a", "smb"), point("b", null)],
      total: 5,
      withoutLocation: 3,
      truncated: false,
    });
    expect(host.querySelector("[data-map-view]")).not.toBeNull();
    expect(spy.mapProps?.points).toEqual([
      expect.objectContaining({ id: "a", group: "smb", color: "success1" }),
      expect.objectContaining({ id: "b", group: "" }),
    ]);
    expect([...host.querySelectorAll("[data-map-legend]")].map((entry) => entry.textContent)).toEqual([
      "SMB",
      "RecordModel.missing",
      "RecordMapWidgets.mixed",
    ]);
    expect(host.querySelector('[data-map-legend="smb"] span')?.getAttribute("style")).toContain("--chart-success-1");
    expect(host.querySelector('[data-map-legend="mixed"] span')?.className).toContain("border-muted-foreground");
    expect(host.querySelector("[data-map-hint]")?.textContent).toBe("RecordMapWidgets.withoutLocation:3");
    const popover = render((spy.mapProps?.renderPopover as (id: string) => ReactNode)("b"));
    expect(popover.textContent).toContain("Org b");
    expect(popover.textContent).toContain("RecordMapWidgets.postcodePrecision");
    const link = must(popover.querySelector("a"));
    expect(link.getAttribute("href")).toBe("/records/organization/b");
    act(() => link.click());
    expect(spy.open).toHaveBeenCalledWith(
      { typeId: "organization", recordId: "b" },
      link,
      host.querySelector("[data-map-widget]"),
    );
  });

  it("leaves records closed in the editor preview, which shows the details without the record link", () => {
    renderMap(
      { schemaRevision: 1, points: [point("a", "smb")], total: 1, withoutLocation: 0, truncated: false },
      false,
    );
    const popover = render((spy.mapProps?.renderPopover as (id: string) => ReactNode)("a"));
    expect(popover.textContent).toContain("Org a");
    expect(popover.querySelector("a")).toBeNull();
  });

  it("shows the empty state instead of a map when no record has a location", () => {
    const host = renderMap({ schemaRevision: 1, points: [], total: 2, withoutLocation: 2, truncated: false });
    expect(host.querySelector("[data-map-view]")).toBeNull();
    expect(host.querySelector('[data-slot="widget-empty"]')?.textContent).toBe("RecordMapWidgets.noPoints");
    expect(host.querySelector("[data-map-hint]")?.textContent).toBe("RecordMapWidgets.withoutLocation:2");
  });
});
