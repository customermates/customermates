"use client";

import type { RoutineModalStore } from "./routine-modal.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { RoutineTriggerKind } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormSelect } from "@/components/forms/form-select";
import { Button } from "@/components/ui/button";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import {
  ROUTINE_SCHEDULE_PRESETS,
  ROUTINE_WEEKDAY_KEYS,
  describeRoutineSchedule,
  scheduleHasClockTime,
} from "@/ee/routines/routine-schedule-preset";
import { ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine.schema";
import { eventLabel } from "@/features/event/event-label";

import { RoutineRecordTrigger } from "./routine-record-trigger";

const TRIGGER_EVENT_ITEMS = ROUTINE_TRIGGER_EVENTS.map((event) => ({
  key: event,
}));
const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour));
const MINUTES = ["0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, index) => String(index + 1));

function padded(value: string) {
  return value.padStart(2, "0");
}

export const RoutineTriggerFields = observer(({ store }: { store: RoutineModalStore }) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { form } = store;
  const scheduled = form.triggerKind === RoutineTriggerKind.schedule;
  const preset = form.schedulePreset ?? "daily";
  const scheduleSummary = describeRoutineSchedule(store.compiledCron, t, (date) => intlStore.formatTime(date));
  const hasClockTime = scheduleHasClockTime(store.compiledCron);
  return (
    <div className="min-w-0 space-y-4" data-routine-trigger-fields="">
      <FormSelect
        required
        id="triggerKind"
        items={[
          {
            value: RoutineTriggerKind.schedule,
            label: t("RoutineTriggerKind.schedule"),
          },
          {
            value: RoutineTriggerKind.event,
            label: t("RoutineTriggerKind.event"),
          },
        ]}
      />

      {scheduled && preset === "custom" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
          <p className="text-x-sm flex-1">
            {t("RoutineModal.customSchedule", {
              expression: form.cronExpression ?? "",
            })}
          </p>

          <Button
            disabled={!store.canManage}
            size="sm"
            type="button"
            variant="secondary"
            onClick={store.useSchedulePreset}
          >
            {t("RoutineModal.useSchedulePreset")}
          </Button>
        </div>
      ) : scheduled ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <FormSelect
              containerClassName="min-w-44 flex-1"
              id="schedulePreset"
              items={ROUTINE_SCHEDULE_PRESETS.map((value) => ({
                value,
                label: t(`RoutineSchedulePreset.${value}`),
              }))}
            />

            {preset === "weekly" && (
              <FormSelect
                ariaLabel={t("Common.inputs.scheduleWeekday")}
                containerClassName="min-w-36"
                id="scheduleWeekday"
                items={ROUTINE_WEEKDAY_KEYS.map((key, index) => ({
                  value: String(index),
                  label: t(`RoutineWeekday.${key}`),
                }))}
                label={null}
              />
            )}

            {preset === "monthly" && (
              <FormSelect
                ariaLabel={t("Common.inputs.scheduleDayOfMonth")}
                containerClassName="w-24"
                id="scheduleDayOfMonth"
                items={DAYS_OF_MONTH.map((value) => ({
                  value,
                  label: value,
                }))}
                label={null}
              />
            )}

            {preset !== "every15Minutes" && preset !== "every30Minutes" && (
              <>
                <span className="text-subdued pb-2.5 text-xs">
                  {preset === "hourly" ? t("RoutineModal.onMinute") : t("RoutineModal.at")}
                </span>

                {preset !== "hourly" && (
                  <FormSelect
                    ariaLabel={t("Common.inputs.scheduleHour")}
                    containerClassName="w-20"
                    id="scheduleHour"
                    items={HOURS.map((value) => ({
                      value,
                      label: padded(value),
                    }))}
                    label={null}
                  />
                )}

                <FormSelect
                  ariaLabel={t("Common.inputs.scheduleMinute")}
                  containerClassName="w-20"
                  id="scheduleMinute"
                  items={MINUTES.map((value) => ({
                    value,
                    label: padded(value),
                  }))}
                  label={null}
                />
              </>
            )}
          </div>

          {hasClockTime && (
            <p className="text-subdued text-xs">
              {`${scheduleSummary} · ${t("RoutineModal.scheduleTimeZone", { timezone: form.timezone ?? "" })}`}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <FormAutocomplete
            required
            id="triggerEvents"
            items={TRIGGER_EVENT_ITEMS}
            renderValue={(items) => items.map((item) => <AppChip key={item.key}>{eventLabel(t, item.key)}</AppChip>)}
            selectionMode="multiple"
          >
            {(item) => <span>{eventLabel(t, item.key)}</span>}
          </FormAutocomplete>

          <p className="text-subdued text-xs">{t("RoutineModal.eventSuppressionNote")}</p>

          {store.usesRecordTrigger &&
            (form.recordSources?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {form.recordSources.map((source, index) => (
                  <AppChip key={`${source.query.typeId}:${index}`}>
                    {store.recordModel?.types.find((type) => type.id === source.query.typeId)?.pluralLabel ??
                      t("RecordModel.records")}

                    {" · "}

                    {source.events.map((event) => eventLabel(t, event)).join(", ")}
                  </AppChip>
                ))}
              </div>
            ) : (
              <RoutineRecordTrigger store={store} />
            ))}
        </div>
      )}
    </div>
  );
});
