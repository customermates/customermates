"use client";

import type { ActivitiesStore } from "@/features/messaging/activities/activities.store";
import type { ActivityWidgetDto } from "@/features/widget/widget.schema";
import type { Filter } from "@/core/base/base-get.schema";
import type { ActivityWidgetState } from "./activity-widget-state";

import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { useFilterFieldLabel } from "@/components/entity-terminology/use-filter-field-label";
import { useRootStore } from "@/core/stores/root-store.provider";

import { WidgetFilterChip } from "./widget-filter-chip";

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
  const summary = COUNT_STATES.includes(state)
    ? t("Dashboard.activityWidget.activityCount", {
        count: store.pagination?.total ?? store.items.length,
      })
    : undefined;

  if (active.length === 0 && !summary) return null;

  return (
    <p className="text-muted-foreground line-clamp-2 w-full text-xs wrap-break-word">
      {summary && <span>{summary}</span>}

      {active.map((filter, index) => (
        <Fragment key={`${filter.field}-${index}`}>
          {(index > 0 || summary) && (
            <span aria-hidden className="mx-1 opacity-40">
              ·
            </span>
          )}

          <WidgetFilterChip
            customColumns={store.customColumns}
            filter={filter}
            label={filterFieldLabel(filter.field, store.customColumns)}
            onOpen={() => widgetModalStore.openWithFilter(widget.id, "activityFilters", filter.field)}
          />
        </Fragment>
      ))}
    </p>
  );
});
