"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { GroupSummaryDefinition } from "@/core/base/grouping/grouping.schema";

import { Plus, X } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GROUP_SUMMARY_AGGREGATIONS, MAX_GROUP_SUMMARIES } from "@/core/base/grouping/grouping.schema";

import { PopoverSection as Section } from "./popover-section";

export function nextGroupSummary(
  summaries: GroupSummaryDefinition[],
  fields: { id: string }[],
): GroupSummaryDefinition | undefined {
  if (summaries.length >= MAX_GROUP_SUMMARIES) return undefined;
  return GROUP_SUMMARY_AGGREGATIONS.flatMap((aggregation) =>
    fields.map((field) => ({ fieldId: field.id, aggregation })),
  ).find(
    (candidate) =>
      !summaries.some(
        (summary) => summary.fieldId === candidate.fieldId && summary.aggregation === candidate.aggregation,
      ),
  );
}

export const GroupSummaryOptions = observer(function GroupSummaryOptions<E extends HasId>({
  store,
}: {
  store: BaseDataViewStore<E>;
}) {
  const t = useTranslations();
  const fields = store.summaryFields;
  if (!store.grouping || !fields.length) return null;
  const summaries = store.grouping.summaries ?? [];
  const next = nextGroupSummary(summaries, fields);
  const update = (index: number, value: Partial<GroupSummaryDefinition>) => {
    const changed = { ...summaries[index], ...value };
    const taken = summaries.some(
      (summary, position) =>
        position !== index && summary.fieldId === changed.fieldId && summary.aggregation === changed.aggregation,
    );
    if (!taken) store.setGroupSummaries(summaries.map((summary, position) => (position === index ? changed : summary)));
  };

  return (
    <Section label={t("DataView.summaries")}>
      <div className="flex flex-col gap-1.5">
        {summaries.map((summary, index) => (
          <div key={index} className="flex items-center gap-1">
            <Select value={summary.fieldId} onValueChange={(fieldId) => update(index, { fieldId })}>
              <SelectTrigger aria-label={t("RecordModel.summaryField")} className="h-8 min-w-0 flex-1" size="sm">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {fields.map((field) => (
                  <SelectItem key={field.id} value={field.id}>
                    {field.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={summary.aggregation}
              onValueChange={(aggregation) =>
                update(index, { aggregation: aggregation as GroupSummaryDefinition["aggregation"] })
              }
            >
              <SelectTrigger aria-label={t("RecordModel.summaryAggregation")} className="h-8 w-24 shrink-0" size="sm">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {GROUP_SUMMARY_AGGREGATIONS.map((aggregation) => (
                  <SelectItem key={aggregation} value={aggregation}>
                    {t(`RecordModel.reducers.${aggregation}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              aria-label={t("RecordModel.removeGroupSummary")}
              className="size-8 shrink-0"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => store.setGroupSummaries(summaries.filter((_, position) => position !== index))}
            >
              <X aria-hidden className="size-3.5" />
            </Button>
          </div>
        ))}

        <Button
          className="h-8 self-start"
          disabled={!next}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => next && store.setGroupSummaries([...summaries, next])}
        >
          <Plus aria-hidden className="size-3.5" />

          {t("RecordModel.addGroupSummary")}
        </Button>
      </div>
    </Section>
  );
});
