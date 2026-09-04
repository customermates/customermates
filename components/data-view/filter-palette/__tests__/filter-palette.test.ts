import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { ComponentProps, ReactNode } from "react";
import type { RootStore } from "@/core/stores/root.store";

import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CustomColumnType, EntityType } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({ palette: { current: null as unknown } }));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    filterPaletteStore: harness.palette.current,
    intlStore: {
      formatNumber: () => "",
      formatNumberForEditing: () => "",
      parseNumberToCanonical: (value: string) => value,
      use12Hour: false,
    },
    terminologyStore: { overrides: [] },
  }),
}));
vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children: ReactNode }) => children,
  useAppForm: () => harness.palette.current,
}));

import { ACTIVITY_FILTER_VALUE_MAX } from "@/ee/messaging/activities/activities.schema";
import { Command } from "@/components/ui/command";
import { ActivityQueryProvider } from "@/features/messaging/activities/activity-query-context";
import { FilterPalette } from "../filter-palette";
import { FilterPaletteStore } from "../filter-palette.store";
import { PaletteValueSelect } from "../palette-value-select";

type ActivityQueryProviderProps = ComponentProps<typeof ActivityQueryProvider>;

const CURRENCY_COLUMN = "11111111-1111-4111-8111-111111111111";

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: "name", operators: [FilterOperatorKey.contains, FilterOperatorKey.equals] },
  { field: "status", operators: [FilterOperatorKey.in, FilterOperatorKey.notIn] },
  {
    field: "createdAt",
    operators: [
      FilterOperatorKey.gt,
      FilterOperatorKey.gte,
      FilterOperatorKey.lt,
      FilterOperatorKey.lte,
      FilterOperatorKey.between,
      FilterOperatorKey.inLastDays,
    ],
  },
  { field: "adProvider", operators: [FilterOperatorKey.in, FilterOperatorKey.notIn] },
  {
    field: CURRENCY_COLUMN,
    operators: [FilterOperatorKey.gte, FilterOperatorKey.lte, FilterOperatorKey.isNull],
  },
];

const CUSTOM_COLUMNS = [
  { id: CURRENCY_COLUMN, label: "Budget", entityType: EntityType.deal, type: CustomColumnType.currency },
] as unknown as CustomColumnDto[];

function tableStore(filters: Filter[] = []) {
  const table = {
    customColumns: CUSTOM_COLUMNS,
    filterableFields: FILTERABLE_FIELDS,
    filters,
    p13nId: "deals",
    setQueryOptions: vi.fn((args: { filters?: Filter[] }) => {
      if (args.filters) table.filters = args.filters;
    }),
  };

  return table;
}

function openPalette(table: ReturnType<typeof tableStore>) {
  const root = { registerModalStore: vi.fn(), localeStore: { getTranslation: (key: string) => key } };
  const palette = new FilterPaletteStore(root as unknown as RootStore);
  palette.openFor(table as unknown as BaseDataViewStore<HasId>);
  harness.palette.current = palette;

  return palette;
}

function render(table: ReturnType<typeof tableStore>) {
  return renderToStaticMarkup(createElement(FilterPalette, { store: table as unknown as BaseDataViewStore<HasId> }));
}

function occurrences(markup: string, needle: string) {
  return markup.split(needle).length - 1;
}

describe("filter palette pages", () => {
  it("lists every filterable field by its human label and never by its column id", () => {
    const table = tableStore();
    openPalette(table);

    const markup = render(table);

    expect(occurrences(markup, "data-palette-field=")).toBe(FILTERABLE_FIELDS.length);
    expect(markup).toContain(">Budget<");
    expect(occurrences(markup, CURRENCY_COLUMN)).toBe(1);
    expect(markup).toContain(`data-palette-field="${CURRENCY_COLUMN}"`);
    expect(markup).toContain("Common.filters.palette.fieldsGroup");
  });

  it("asks for no operator and no value on the root page", () => {
    const table = tableStore();
    openPalette(table);

    const markup = render(table);

    expect(markup).not.toContain("<select");
    expect(occurrences(markup, "<input")).toBe(1);
    expect(markup).not.toContain("data-palette-operator-trigger");
  });

  it("carries no saved filter preset affordance", () => {
    const table = tableStore();
    openPalette(table);

    expect(render(table)).not.toContain("Common.filters.presets");
  });

  it("shows the applied filters above the fields and counts them per field", () => {
    const table = tableStore([
      { field: "status", operator: FilterOperatorKey.in, value: ["open"] } as Filter,
      { field: "status", operator: FilterOperatorKey.in, value: ["won"] } as Filter,
    ]);
    openPalette(table);

    const markup = render(table);

    expect(markup.indexOf("Common.filters.palette.activeGroup")).toBeGreaterThanOrEqual(0);
    expect(markup.indexOf("Common.filters.palette.activeGroup")).toBeLessThan(
      markup.indexOf("Common.filters.palette.fieldsGroup"),
    );
    expect(occurrences(markup, "data-filter-index=")).toBe(2);
    expect(markup).toContain("Common.filters.palette.appliedCount");
  });

  it("disables every field row once the applied filters reach the cap", () => {
    const table = tableStore(
      Array.from(
        { length: 50 },
        (_, index) => ({ field: "name", operator: FilterOperatorKey.contains, value: `q${index}` }) as Filter,
      ),
    );
    openPalette(table);

    const markup = render(table);

    expect(occurrences(markup, 'aria-disabled="true"')).toBeGreaterThanOrEqual(FILTERABLE_FIELDS.length);
  });

  it("renders list-shaped pages inside a command root", () => {
    const table = tableStore();
    const palette = openPalette(table);

    expect(render(table)).toContain("cmdk-root");

    palette.pickField("status");
    expect(render(table), "select page").toContain("cmdk-root");

    palette.pop();
    palette.pickField("adProvider");
    expect(render(table), "operator page").toContain("cmdk-root");

    palette.pop();
    palette.pickField("createdAt");
    expect(render(table), "date rows page").toContain("cmdk-root");
  });

  it("renders form-shaped pages with no command root, because cmdk swallows Enter, Home, End and the arrows", () => {
    const table = tableStore();
    const palette = openPalette(table);

    palette.pickField("name");
    expect(render(table), "text page").not.toContain("cmdk-root");

    palette.pop();
    palette.pickField(CURRENCY_COLUMN);
    expect(render(table), "number page").not.toContain("cmdk-root");

    palette.pop();
    palette.pickField("createdAt");
    palette.pushDateInput(FilterOperatorKey.lt);
    expect(render(table), "date input page").not.toContain("cmdk-root");
  });

  it("offers the operator menu and a back control on every page above the root", () => {
    const table = tableStore();
    const palette = openPalette(table);

    palette.pickField("status");
    const markup = render(table);

    expect(markup).toContain("data-palette-operator-trigger");
    expect(markup).toContain('id="filter-palette-back"');
    expect(markup).toContain("Common.filters.operators.in");
  });
});

describe("palette value select on an activity surface", () => {
  const timelineFilter = { field: "timelineKind", operator: FilterOperatorKey.in, value: [] } as unknown as Filter;

  function renderSelect(selected: string[], inActivityQuery: boolean) {
    const page = createElement(
      Command,
      { shouldFilter: false },
      createElement(PaletteValueSelect, {
        customColumns: CUSTOM_COLUMNS,
        filter: timelineFilter,
        query: "",
        selected,
        onToggle: () => undefined,
      }),
    );

    return renderToStaticMarkup(
      inActivityQuery
        ? createElement(ActivityQueryProvider, { filters: [] } as unknown as ActivityQueryProviderProps, page)
        : page,
    );
  }

  it("caps selection and disables the rest once the activity value maximum is reached", () => {
    const selected = Array.from({ length: ACTIVITY_FILTER_VALUE_MAX }, (_, index) => `value-${index}`);
    const markup = renderSelect(selected, true);

    expect(markup).toContain("Common.filters.selectionLimit");
    expect(markup).toContain('role="status"');
    expect(occurrences(markup, 'aria-disabled="true"')).toBe(3);
  });

  it("leaves the same page uncapped outside an activity query", () => {
    const selected = Array.from({ length: ACTIVITY_FILTER_VALUE_MAX }, (_, index) => `value-${index}`);
    const markup = renderSelect(selected, false);

    expect(markup).not.toContain("Common.filters.selectionLimit");
    expect(occurrences(markup, 'aria-disabled="true"')).toBe(0);
    expect(markup).toContain("EntityTimeline.types.messages");
  });
});
