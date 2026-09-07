import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const SCANNED_DIRECTORIES = ["app", "components", "features", "ee", "core", "workflows"];

const WIDGET_EDITOR_DIRECTORY = "app/[locale]/(protected)/dashboard";

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function sourceFiles(directories: string[]): string[] {
  return directories.flatMap((directory) =>
    walkFiles(join(REPO_ROOT, directory), (path) => /\.tsx?$/.test(path) && !path.includes(`${sep}__tests__${sep}`)),
  );
}

const dashboardComponent = (name: string) => read(`app/[locale]/(protected)/dashboard/components/${name}`);

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("dashboard widget UI", () => {
  it("summarizes the activity feed in the widget heading", () => {
    const card = dashboardComponent("activity-widget-card.tsx");
    const header = between(card, "<AppCardHeader", "</AppCardHeader>");

    expect(header).toContain("<ActivityWidgetFilters");
  });

  it("leaves save, reset and close to the shared form and overlay components", () => {
    const modal = dashboardComponent("widget-modal.tsx");

    expect(modal).toContain("<FormActions");
    expect(modal).toContain('anchorScope="widget-modal"');
    expect(modal).not.toContain("function requestClose");
    expect(modal).not.toContain("Common.actions.cancel");
  });

  it("uses the shared overlay action treatment for widget deletion", () => {
    const modal = dashboardComponent("widget-modal.tsx");
    const deleteAction = between(modal, "actions={", "size=");

    expect(deleteAction).toContain('id: "delete-widget"');
    expect(deleteAction).toContain("icon: Trash2");
    expect(deleteAction).toContain('variant: "destructive"');
  });

  it("limits activity widget metadata to the count and active filters", () => {
    const filters = dashboardComponent("activity-widget-filters.tsx");
    const chartCard = dashboardComponent("chart-widget-card.tsx");

    expect(filters).toContain("Dashboard.activityWidget.activityCount");
    for (const source of [filters, chartCard]) expect(source).toContain("<WidgetFilterChip");
  });

  it("shows linked records as entity chips in the activity detail header, not inline on each row", () => {
    const chips = read("features/messaging/activities/activity-record-chips.tsx");
    const row = read("features/messaging/activities/activities-row.tsx");
    const detailHeader = between(row, "export function DetailHeader", "type TimelineRowProps");
    const timelineRow = row.slice(row.indexOf("export function TimelineRow"));

    expect(chips).toContain("<AppChipStack");
    expect(chips).toContain("chipHref={(item) => entityHref(item.entityType, item.recordId)}");
    expect(chips).toContain("ENTITY_ICON[ref.entityType]");
    expect(chips).toContain('<Avatar name={ref.label} size="sm" src={ref.avatarUrl} />');
    expect(detailHeader).toContain("<ActivityRecordChips context={records} />");
    expect(timelineRow).not.toContain("ActivityRecordChips");
  });

  it("keeps linked-record chips on the shared chip stack and its default geometry", () => {
    const chips = read("features/messaging/activities/activity-record-chips.tsx");
    const stack = between(chips, "<AppChipStack", "/>");

    expect(stack).toContain('size="sm"');
    expect(between(chips, '<div className="min-w-0 flex-1">', "</div>")).toContain("<AppChipStack");
  });

  it("gives the detail header a larger avatar and its linked records", () => {
    const audit = read("features/messaging/activities/audit-detail.tsx");

    expect(audit).toContain('size="xl"');
    expect(audit).toContain("records={entry.records}");
  });

  it("uses shared filters inside activity data settings", () => {
    const fields = dashboardComponent("activity-filter-fields.tsx");
    const modal = dashboardComponent("widget-modal.tsx");
    const selectableCard = read("components/forms/selectable-card.tsx");
    const displayTypePicker = dashboardComponent("widget-display-type-picker.tsx");

    expect(fields).toContain("<SelectableCard");
    expect(fields).toContain('selectionMode="multiple"');
    expect(fields).toContain("<FilterAccordion");
    expect(fields).toContain('baseId="timelineFilters"');
    expect(fields).toContain("filterIndices={filterEntries.map");
    expect(fields).toContain('variant="grouped"');
    expect(selectableCard).toContain("<Checkbox");
    expect(selectableCard).toContain("<RadioGroupItem");
    expect(displayTypePicker).toContain("<SelectableCard");
    expect(displayTypePicker).toContain('selectionMode="single"');
    expect(modal).toContain('widgetModalStore.expandedSection === "activityFilters"');
    expect(modal).toContain("onConnectedAccountChange={widgetModalStore.clearActivityThreadFilter}");
    expect(modal).toContain("form.kind === WidgetKind.chart && (");
  });

  it("groups each chart filter family inside one bordered accordion surface", () => {
    const accordion = read("components/data-view/filter-modal/filter-accordion.tsx");
    const modal = dashboardComponent("widget-modal.tsx");
    const fields = dashboardComponent("activity-filter-fields.tsx");
    const groupedSurface = between(accordion, 'variant === "grouped" &&', "\n");
    const groupedCallers = sourceFiles(SCANNED_DIRECTORIES).filter((file) =>
      readFileSync(file, "utf8").includes('variant="grouped"'),
    );

    expect(accordion).toContain('variant = "plain"');
    expect(groupedSurface).toContain("rounded-md border border-input");
    expect(between(modal, 'baseId="entityFilters"', "/>")).toContain('variant="grouped"');
    expect(between(modal, 'baseId="dealFilters"', "/>")).toContain('variant="grouped"');
    expect(between(fields, 'baseId="timelineFilters"', "/>")).toContain('variant="grouped"');
    expect(groupedCallers.map((file) => relative(REPO_ROOT, file)).sort()).toEqual([
      "app/[locale]/(protected)/dashboard/components/activity-filter-fields.tsx",
      "app/[locale]/(protected)/dashboard/components/widget-modal.tsx",
    ]);
  });

  it("keeps the list-surface filter palette off the widget editor accordion", () => {
    const listSurfaceFiles = sourceFiles(["components/data-view/filter-palette", "components/data-view/header"]);
    const borrowed = listSurfaceFiles.filter((file) => {
      const source = readFileSync(file, "utf8");

      return (
        source.includes("filter-modal/filter-accordion") ||
        source.includes("filter-modal/filter-field") ||
        source.includes("<FilterAccordion") ||
        source.includes("<FilterField") ||
        source.includes('baseId="timelineFilters"')
      );
    });

    expect(listSurfaceFiles.length).toBeGreaterThan(10);
    expect(borrowed, borrowed.join("\n")).toEqual([]);
    expect(read("components/data-view/filter-palette/filter-palette.tsx")).toContain("<PaletteRootList");
    expect(read("components/data-view/header/filter-popover.tsx")).toContain("<FilterPalette");
  });

  it("disables shared filter operator controls with the surrounding form", () => {
    const field = read("components/data-view/filter-modal/filter-field.tsx");
    const fields = dashboardComponent("activity-filter-fields.tsx");

    expect(field).toContain("const isDisabled = form?.isDisabled ?? false");
    expect(field).toContain("<Select disabled={isDisabled}");
    expect(field).toContain("disabled={isDisabled}");
    expect(between(fields, "<SelectableCard", "/>")).toContain("disabled={form?.isDisabled}");
    expect(between(fields, "Dashboard.widgetEditor.filters.removeUnavailable", "</button>")).toContain(
      "disabled={form?.isDisabled}",
    );
  });

  it("holds every widget filter edit until the widget editor's own save", () => {
    const store = dashboardComponent("widget-modal.store.ts");
    const field = read("components/data-view/filter-modal/filter-field.tsx");
    const widgetEditorFiles = sourceFiles([WIDGET_EDITOR_DIRECTORY]);
    const autoApplying = widgetEditorFiles.filter((file) => {
      const source = readFileSync(file, "utf8");

      return source.includes("filter-palette") || source.includes("FILTER_AUTO_APPLY_DELAY_MS");
    });

    expect(widgetEditorFiles.length).toBeGreaterThan(10);
    expect(autoApplying, autoApplying.join("\n")).toEqual([]);
    expect(store).not.toContain("flushPendingChanges");
    expect(store).toContain("onSubmit = async (event?: FormEvent<HTMLFormElement>)");
    expect(field).toContain("form?.flushPendingChanges?.();");
  });

  it("renders axis options as ordinary switches", () => {
    const modal = dashboardComponent("widget-modal.tsx");
    const appearance = between(modal, "function renderChartAppearance", "function renderAppearanceSettings");

    expect(appearance).toContain('id="displayOptions.reverseXAxis"');
    expect(appearance).toContain('id="displayOptions.reverseYAxis"');
  });

  it("places Preview badges inside both preview cards", () => {
    const modal = dashboardComponent("widget-modal.tsx");
    const preview = dashboardComponent("widget-preview.tsx");

    expect(preview).toContain('id="widget-preview-heading"');
    expect(preview).toContain('t("Dashboard.widgetEditor.preview.title")');
    expect(preview).toContain("filters: activeFilterCount");
    expect(modal).toContain("activityFilters={widgetModalStore.previewTimelineFilters}");
  });

  it("backs the activity timeline states with one skeleton, animated for loading and static when empty", () => {
    const card = dashboardComponent("activity-widget-card.tsx");
    const panel = read("features/messaging/activities/activities-panel.tsx");

    expect(card).toContain("<ActivityTimelineSkeleton />");
    expect(card).toContain("<ActivityTimelineSkeleton animated={false}");
    expect(panel).toContain("<ActivityTimelineSkeleton animated={false}");
    for (const source of [card, panel]) expect(source).toContain("background={");
  });

  it("previews the activity timeline with the real store instead of simulated rows", () => {
    const preview = dashboardComponent("widget-preview.tsx");

    expect(preview).toContain("useOwnedActivitiesStore");
    expect(preview).toContain("<ActivitiesList");
  });

  it("resolves activity filter labels through the shared record-options action", () => {
    const input = read("components/data-view/filter-modal/inputs/filter-input-select.tsx");
    const items = read("components/data-view/filter-modal/inputs/use-filter-select-items.tsx");
    const chip = read("components/data-view/filter-modal/filter-chip-display.tsx");
    const paletteSelect = read("components/data-view/filter-palette/palette-value-select.tsx");
    const resolvers = sourceFiles(SCANNED_DIRECTORIES).filter((file) =>
      readFileSync(file, "utf8").includes("getActivityRecordOptionsAction({"),
    );

    expect(input).toContain('role="status"');
    expect(items).toContain("getActivityRecordOptionsAction");
    expect(items).toContain("activityEntityTypeForFilterField(");
    expect(items).toContain("ACTIVITY_FILTER_VALUE_MAX");
    for (const source of [input, chip, paletteSelect]) {
      expect(source).toContain("use-filter-select-items");
      expect(source).toContain("useFilterSelectItems(");
    }
    expect(resolvers.map((file) => relative(REPO_ROOT, file))).toEqual([
      "components/data-view/filter-modal/inputs/use-filter-select-items.tsx",
    ]);
  });
});
