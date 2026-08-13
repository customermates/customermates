"use client";

import type { ActivitiesStore } from "@/features/messaging/activities/activities.store";
import type { ActivityWidgetDto } from "@/features/widget/widget.schema";
import type { Filter } from "@/core/base/base-get.schema";
import type { ActivityWidgetState } from "./activity-widget-state";

import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { FilterChipValue } from "@/components/data-view/filter-modal/filter-chip-display";
import { useFilterFieldLabel } from "@/components/entity-terminology/use-filter-field-label";
import { useRootStore } from "@/core/stores/root-store.provider";

import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";

const COUNT_STATES: ActivityWidgetState[] = ["content", "noActivity", "noMatches"];

type Props = {
  state: ActivityWidgetState;
  store: ActivitiesStore;
  widget: ActivityWidgetDto;
};

export const ActivityWidgetFilters = observer(({ state, store, widget }: Props) => {
  const t = useTranslations();
  const filterFieldLabel = useFilterFieldLabel();
  const { widgetModalStore } = useRootStore();
  const active: Filter[] = (widget.timelineFilters ?? []).filter(hasValidFilterConfiguration);
  const summaries = COUNT_STATES.includes(state)
    ? [
        t("Dashboard.activityWidget.activityCount", {
          count: store.pagination?.total ?? store.items.length,
        }),
      ]
    : [];

  if (active.length === 0 && summaries.length === 0) return null;

  return (
    <p className="text-muted-foreground line-clamp-2 w-full text-xs wrap-break-word">
      {summaries.map((summary, index) => (
        <Fragment key={summary}>
          {index > 0 && (
            <span aria-hidden className="mx-1 opacity-40">
              ·
            </span>
          )}

          <span>{summary}</span>
        </Fragment>
      ))}

      {active.map((filter, index) => {
        const label = filterFieldLabel(filter.field, store.customColumns);

        return (
          <Fragment key={`${filter.field}-${index}`}>
            {(index > 0 || summaries.length > 0) && (
              <span aria-hidden className="mx-1 opacity-40">
                ·
              </span>
            )}

            <span
              className="hover:bg-muted/50 hover:text-foreground cursor-pointer transition-[color,background-color,transform] active:scale-[0.97] motion-reduce:transition-none"
              role="button"
              tabIndex={0}
              title={label}
              {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}
              onClick={(event) => {
                event.stopPropagation();
                widgetModalStore.openWithFilter(widget.id, "activityFilters", filter.field);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;

                event.preventDefault();
                event.stopPropagation();
                widgetModalStore.openWithFilter(widget.id, "activityFilters", filter.field);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <FilterChipValue
                customColumns={store.customColumns}
                filter={filter}
                label={label}
                operator={t(`Common.filters.operators.${filter.operator}`)}
              />
            </span>
          </Fragment>
        );
      })}
    </p>
  );
});
