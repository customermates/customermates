"use client";

import { useEffect, useMemo, useState } from "react";
import { observable, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { WidgetModalStore } from "@/app/[locale]/(protected)/dashboard/components/widget-modal.store";
import { isRecordActivityWidgetForm } from "@/app/[locale]/(protected)/dashboard/components/record-widget-form";
import { ACTIVITY_KINDS, isChangeActivityKind } from "@/ee/messaging/activities/activities.schema";
import { MessagingProviderSchema } from "@/ee/messaging/messaging.schema";
import { FilterTargetPopover } from "@/components/data-view/filter-palette/filter-target-popover";
import { createRecordActivityFilterTarget } from "./record-activity-filter-target";

export const RecordActivityFilters = observer(function RecordActivityFilters({
  store,
  types,
}: {
  store: WidgetModalStore;
  types: Array<{ id: string; pluralLabel: string }>;
}) {
  const t = useTranslations();
  const sources = useActivitySourceChoices();
  const [typeMetadata] = useState(() => observable.box(types, { deep: false }));
  useEffect(() => {
    runInAction(() => typeMetadata.set(types));
  }, [typeMetadata, types]);
  const target = useMemo(
    () =>
      createRecordActivityFilterTarget({
        read: () => {
          if (!isRecordActivityWidgetForm(store.form)) throw new Error("Activity query unavailable");
          return store.form.activityQuery;
        },
        write: (query) => store.onChange("activityQuery", query),
        isDisabled: () => store.isDisabled,
        identity: () => store.form,
        types: () => typeMetadata.get().map((type) => ({ id: type.id, label: type.pluralLabel })),
        sources,
        providers: MessagingProviderSchema.options.map((id) => ({ id, label: t(`Common.providers.${id}`) })),
        labels: {
          source: t("Common.filters.fields.timelineKind"),
          provider: t("RecordActivityWidgets.filterKinds.provider"),
          account: t("Common.filters.fields.connectedAccountId"),
          thread: t("Common.filters.fields.timelineThreadId"),
          after: t("RecordActivityWidgets.after"),
          before: t("RecordActivityWidgets.before"),
          saved: t("RecordActivityWidgets.savedFilters"),
          unavailable: t("Common.inputs.unavailableSelection"),
        },
      }),
    [store, typeMetadata, t, sources],
  );
  return <FilterTargetPopover id="widget-activity-filters" store={target} />;
});

export function useActivitySourceChoices() {
  const t = useTranslations();
  return useMemo(
    () =>
      ACTIVITY_KINDS.map((id) => ({
        id,
        label: t(
          isChangeActivityKind(id)
            ? `EntityTimeline.types.${id}`
            : id === "message"
              ? "EntityTimeline.types.messages"
              : id === "calendar_event"
                ? "ContactHistory.calendarMeeting"
                : "EntityTimeline.types.activities",
        ),
      })),
    [t],
  );
}
