import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, walkFiles } from "./walk";
const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");
const component = (name: string) => read(`app/[locale]/(protected)/dashboard/components/${name}`);
const sources = (dir: string) => walkFiles(join(REPO_ROOT, dir), (path) => /\.tsx?$/.test(path) && !path.includes(`${sep}__tests__${sep}`));

describe("generic dashboard widget UI", () => {
  it("retains shared form actions, deletion treatment and ordinary appearance switches", () => {
    const modal = component("widget-modal.tsx");
    expect(modal).toContain("<FormFooterActions");
    expect(modal).toContain('anchorScope="widget-modal"');
    expect(modal).toContain('id: "delete-widget"');
    expect(modal).toContain("icon: Trash2");
    expect(modal).toContain('variant: "destructive"');
    expect(modal).toContain('id="displayOptions.reverseXAxis"');
    expect(modal).toContain('id="displayOptions.reverseYAxis"');
    expect(modal).not.toContain("function requestClose");
  });
  it("summarizes activity counts and active filters in the heading", () => {
    const card = component("record-activity-widget-card.tsx");
    const header = card.slice(card.indexOf("<AppCardHeader"), card.indexOf("</AppCardHeader>"));
    expect(header).toContain('t("Dashboard.activityWidget.activityCount", { count: timeline.items.length })');
    expect(header).toContain("widget.displayOptions.showFilters");
    expect(header).toContain("openWithFilter(widget.id, \"activityFilters\")");
    expect(card).toContain("recordActivityFilterCount(query)");
  });
  it("keeps linked-record chips in the activity detail header", () => {
    const chips = read("features/messaging/activities/activity-record-chips.tsx");
    const row = read("features/messaging/activities/activities-row.tsx");
    expect(chips).toContain("<AppChipStack");
    expect(chips).toContain("chipHref={(item) => item.href}");
    expect(chips).toContain("/records/${ref.ref.typeId}/${ref.ref.recordId}");
    expect(chips).toContain("recordTypeIcon(ref.icon)");
    expect(chips).toContain('<Avatar name={ref.label} size="sm" src={ref.avatarUrl} />');
    expect(row.slice(row.indexOf("export function DetailHeader"), row.indexOf("type TimelineRowProps"))).toContain("<ActivityRecordChips context={records} />");
    expect(row.slice(row.indexOf("export function TimelineRow"))).not.toContain("ActivityRecordChips");
    expect(read("features/messaging/activities/audit-detail.tsx")).toContain('size="xl"');
  });
  it("uses host-owned shared palettes for chart, activity and trigger filters", () => {
    const chart = component("record-widget-editor.tsx");
    const activity = component("record-activity-widget-editor.tsx");
    const queryHost = read("components/records/record-query-filters.tsx");
    const activityHost = read("components/records/record-activity-filters.tsx");
    const trigger = read("components/records/record-trigger-fields.tsx");
    expect(chart.match(/<RecordQueryFilters/g)).toHaveLength(2);
    expect(chart).toContain('anchorId="widget-source-filters"');
    expect(chart).toContain('anchorId="widget-group-filters"');
    expect(activity).toContain("<RecordActivityFilters");
    expect(trigger).toContain("<RecordQueryFilters");
    for (const host of [queryHost, activityHost]) {
      expect(host).toContain("<FilterTargetPopover");
      expect(host).toContain("store.onChange");
      expect(host).toContain("store.isDisabled");
      // MobX runInAction only updates local metadata; hosts must not import server actions.
      expect(host).not.toMatch(/from ["'][^"']*\/actions["']/);
      expect(host).not.toMatch(/\bupsert\w*\s*\(/);
    }
    expect(component("record-widget-filters.tsx")).not.toMatch(/RecordWidgetFieldFilters|RecordWidgetRelatedFilters/);
    expect(activity).not.toContain("activity-add-filter");
  });
  it("keeps widget filter drafts local until the editor is saved", () => {
    const store = component("widget-modal.store.ts");
    expect(store).toContain("onSubmit = async (event?: FormEvent<HTMLFormElement>)");
    expect(store).not.toContain("flushPendingChanges");
    const autoApplying = sources("app/[locale]/(protected)/dashboard").filter((file) => /filter-palette|FILTER_AUTO_APPLY_DELAY_MS/.test(readFileSync(file, "utf8")));
    expect(autoApplying).toEqual([]);
  });
  it("previews both widget kinds as their real dashboard cards, keyed to the current draft", () => {
    const chart = component("record-widget-editor.tsx");
    const activity = component("record-activity-widget-editor.tsx");
    expect(chart).not.toContain("onRefresh");
    expect(chart).toContain("await store.runPreview(() => previewRecordWidgetAction(parsed.data))");
    expect(chart).toContain("<RecordWidgetCard");
    expect(chart).toContain("preview?.key === key");
    expect(activity).not.toContain("onRefresh");
    expect(activity).toContain("<RecordActivityWidgetCard");
  });
  it("keeps activity loading and empty states on the shared skeleton", () => {
    const card = component("record-activity-widget-card.tsx");
    const panel = read("features/messaging/activities/record-activities-panel.tsx");
    expect(card).toContain("<ActivityTimelineSkeleton />");
    expect(card).toContain("<ActivityTimelineSkeleton animated={false}");
    expect(panel).toContain("ActivityTimelineSkeleton");
    expect(panel).toContain("TimelineEmptyState");
    expect(panel).toContain('t("ErrorCard.retry")');
  });
  it("resolves current record and thread labels through their authorized interfaces", () => {
    const activity = component("record-activity-widget-editor.tsx");
    const items = read("components/data-view/filter-modal/inputs/use-filter-select-items.tsx");
    expect(activity).toContain("resolveSearchReferencesAction({ refs:");
    expect(activity).toContain("getRecordChoicesAction({ typeId");
    expect(items).toContain("getMessagingThreadAction(id)");
    expect(items).toContain("getMessagingThreadsAction");
    expect(items).toContain('t("Common.inputs.unavailableSelection")');
    expect(items).not.toContain("getActivityRecordOptionsAction");
  });
});
