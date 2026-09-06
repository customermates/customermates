import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { ComponentProps, ReactNode } from "react";
import type { RootStore } from "@/core/stores/root.store";

import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { CustomColumnType, EntityType } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({ palette: { current: null as unknown } }));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
function formatValues(values: Record<string, unknown>) {
  return Object.entries(values)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(",");
}

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${formatValues(values)})` : key,
}));
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

function openingTag(markup: string, needle: string) {
  const at = markup.indexOf(needle);

  return at < 0 ? "" : markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

function between(markup: string, from: string, to: string) {
  const start = markup.indexOf(from);

  return start < 0 ? "" : markup.slice(start, markup.indexOf(to, start));
}

type Rgb = [number, number, number];

const THEME_TOKENS = readThemeTokens();

function readThemeTokens() {
  const css = readFileSync(join(process.cwd(), "styles/globals.css"), "utf8");

  return { light: declarationsAfter(css, "\n:root,\n.light,"), dark: declarationsAfter(css, "\n.dark,\n") };
}

function declarationsAfter(css: string, opener: string) {
  const start = css.indexOf(opener);
  const block = start < 0 ? "" : css.slice(start, css.indexOf("\n}", start));
  const tokens = new Map<string, string>();

  for (const [, name, value] of block.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) tokens.set(name, value.trim());

  return tokens;
}

function tokenValue(tokens: Map<string, string>, name: string) {
  let value = tokens.get(name);

  for (let hop = 0; hop < 4 && value?.startsWith("var("); hop += 1) value = tokens.get(value.slice(4, -1).trim());

  return value ?? "";
}

function fillToken(tag: string, variant: string) {
  const classes = /class="([^"]*)"/.exec(tag)?.[1].split(/\s+/) ?? [];
  const prefix = variant ? `${variant}:bg-` : "bg-";
  const match = classes.find((name) => name.startsWith(prefix) && (variant !== "" || !name.includes(":")));

  return match ? `--${match.slice(prefix.length)}` : "";
}

function composite(tokens: Map<string, string>, token: string, ground: Rgb): Rgb {
  if (token === "") return ground;

  const value = tokenValue(tokens, token);
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];

  const wash = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)%\s*\)$/.exec(value);
  if (!wash) throw new Error(`unreadable colour for ${token}: ${value}`);

  const alpha = Number(wash[4]) / 100;

  return ground.map((base, channel) => Number(wash[channel + 1]) * alpha + base * (1 - alpha)) as Rgb;
}

function luminance(rgb: Rgb) {
  const [r, g, b] = rgb.map((channel) => {
    const ratio = channel / 255;

    return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(one: Rgb, other: Rgb) {
  const [high, low] = [luminance(one), luminance(other)].sort((left, right) => right - left);

  return (high + 0.05) / (low + 0.05);
}

function cursorStep(theme: "light" | "dark", tag: string) {
  const tokens = THEME_TOKENS[theme];
  const ground = composite(tokens, "--popover", [0, 0, 0]);
  const resting = composite(tokens, fillToken(tag, ""), ground);
  const selected = composite(tokens, fillToken(tag, "data-[selected=true]"), ground);

  return { resting, selected, step: contrast(resting, selected) };
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

  it("dresses the operator as a bordered dropdown with a chevron, never as a caption", () => {
    const table = tableStore();
    const palette = openPalette(table);

    palette.pickField("status");
    const markup = render(table);
    const trigger = openingTag(markup, "data-palette-operator-trigger");

    expect(trigger).toContain('data-variant="field"');
    expect(trigger).toContain("border border-input");
    expect(trigger).toContain("bg-input-background");
    expect(trigger).not.toContain("text-xs");
    expect(between(markup, "data-palette-operator-trigger", "</button>")).toContain("lucide-chevron-down");
  });

  it("sizes the back control to match the operator so the header reads as one control row", () => {
    const table = tableStore();
    const palette = openPalette(table);

    palette.pickField("status");
    const markup = render(table);

    expect(openingTag(markup, 'id="filter-palette-back"')).toContain('data-size="icon-sm"');
    expect(openingTag(markup, "data-palette-operator-trigger")).toContain('data-size="sm"');
  });

  it("still disables the operator control on a field that declares no operator", () => {
    const table = tableStore();
    const palette = openPalette(table);

    palette.pickField("retired");
    const trigger = openingTag(render(table), "data-palette-operator-trigger");

    expect(trigger).toContain("disabled=");
    expect(trigger).toContain("disabled:opacity-100");
  });

  it("shapes an applied filter as a chip that no plain field row ever takes", () => {
    const table = tableStore([{ field: "status", operator: FilterOperatorKey.in, value: ["open"] } as Filter]);
    openPalette(table);

    const markup = render(table);
    const applied = openingTag(markup, "data-filter-index=");
    const field = openingTag(markup, 'data-palette-field="status"');

    expect(applied).toContain("border border-input");
    expect(applied).toContain("rounded-md");
    expect(applied).toContain("py-2");
    expect(fillToken(applied, "")).toBe("");
    expect(field).not.toContain("border border-input");
    expect(field).toContain("rounded-sm");
    expect(between(markup, "data-palette-remove-filter=", "</button>")).toContain("size-3.5 text-current");
  });

  it("moves an applied chip's fill under the cursor at least as far as a plain field row moves", () => {
    const table = tableStore([{ field: "status", operator: FilterOperatorKey.in, value: ["open"] } as Filter]);
    openPalette(table);

    const markup = render(table);
    const applied = openingTag(markup, "data-filter-index=");
    const field = openingTag(markup, 'data-palette-field="status"');

    expect(applied).toContain("data-[selected=true]:border-border-strong");
    expect(applied).not.toContain("data-[selected=true]:bg-accent");
    expect(field).not.toContain("data-[selected=true]:bg-accent");

    for (const theme of ["light", "dark"] as const) {
      const chip = cursorStep(theme, applied);
      const row = cursorStep(theme, field);

      const towardsForeground =
        theme === "light"
          ? luminance(chip.selected) < luminance(chip.resting)
          : luminance(chip.selected) > luminance(chip.resting);

      expect(chip.step).toBeGreaterThan(1.1);
      expect(chip.step).toBeGreaterThanOrEqual(row.step - 0.001);
      expect(towardsForeground).toBe(true);
    }
  });

  it("never rests an applied chip below the popover it sits on", () => {
    const table = tableStore([{ field: "status", operator: FilterOperatorKey.in, value: ["open"] } as Filter]);
    openPalette(table);

    const applied = openingTag(render(table), "data-filter-index=");

    for (const theme of ["light", "dark"] as const) {
      const ground = luminance(composite(THEME_TOKENS[theme], "--popover", [0, 0, 0]));
      const resting = luminance(cursorStep(theme, applied).resting);

      if (theme === "light") expect(resting).toBeGreaterThanOrEqual(ground);
      else expect(resting).toBeLessThanOrEqual(ground);
    }
  });

  it("names the operator control by its purpose and the condition it currently holds", () => {
    const table = tableStore();
    const palette = openPalette(table);

    palette.pickField("status");
    const trigger = openingTag(render(table), "data-palette-operator-trigger");

    expect(trigger).toContain('aria-label="Common.filters.palette.editOperatorNamed(operator=');
    expect(trigger).toContain("Common.filters.operators.in)");
    expect(trigger).not.toContain('aria-label="Common.filters.palette.editOperator"');
  });

  it("labels both zones with the section typography the app uses elsewhere", () => {
    const table = tableStore([{ field: "status", operator: FilterOperatorKey.in, value: ["open"] } as Filter]);
    openPalette(table);

    const markup = render(table);

    expect(occurrences(markup, "**:[[cmdk-group-heading]]:uppercase")).toBe(2);
    expect(occurrences(markup, "**:[[cmdk-group-heading]]:text-[11px]")).toBe(2);
    expect(markup).not.toContain("**:[[cmdk-group-heading]]:text-xs");
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
