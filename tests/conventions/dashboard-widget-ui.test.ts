import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
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
    const filterPopover = read("components/data-view/header/filter-popover.tsx");

    expect(accordion).toContain('variant = "plain"');
    expect(filterPopover).not.toContain('variant="grouped"');
  });

  it("disables shared filter operator controls with the surrounding form", () => {
    const field = read("components/data-view/filter-modal/filter-field.tsx");

    expect(field).toContain("const isDisabled = form?.isDisabled ?? false");
    expect(field).toContain("<Select disabled={isDisabled}");
    expect(field).toContain("disabled={isDisabled}");
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

    expect(input).toContain('role="status"');
    expect(items).toContain("getActivityRecordOptionsAction");
    expect(items).toContain("activityEntityTypeForFilterField(");
    expect(items).toContain("ACTIVITY_FILTER_VALUE_MAX");
  });
});
