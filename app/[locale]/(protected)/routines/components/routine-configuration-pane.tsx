"use client";

import type { RoutineModalStore } from "./routine-modal.store";

import { Pause } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { RoutineTriggerKind } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormTextarea } from "@/components/forms/form-textarea";
import { Alert } from "@/components/shared/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import {
  ROUTINE_SCHEDULE_PRESETS,
  ROUTINE_WEEKDAY_KEYS,
  describeRoutineSchedule,
  scheduleHasClockTime,
} from "@/ee/routines/routine-schedule-preset";
import { ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine.schema";
import { routineContractReview } from "@/ee/routines/routine-contract-review";
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

type Props = {
  store: RoutineModalStore;
  onPause: () => void;
};

export const RoutineConfigurationPane = observer(({ store, onPause }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { form } = store;
  const scheduled = form.triggerKind === RoutineTriggerKind.schedule;
  const preset = form.schedulePreset ?? "daily";
  const scheduleSummary = describeRoutineSchedule(store.compiledCron, t, (date) => intlStore.formatTime(date));
  const hasClockTime = scheduleHasClockTime(store.compiledCron);
  const ownerName = form.owner ? `${form.owner.firstName} ${form.owner.lastName}`.trim() : null;
  const ownerAvailable = store.hasAvailableOwner;
  return (
    <section aria-labelledby="routine-configuration-heading" className="min-w-0 space-y-4">
      <h3 className="text-sm font-semibold" id="routine-configuration-heading">
        {t("RoutineModal.configurationHeading")}
      </h3>

      {form.id && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            {form.owner ? (
              <Avatar name={[form.owner.firstName, form.owner.lastName]} src={form.owner.avatarUrl} />
            ) : (
              <Avatar fallback="—" />
            )}

            <div className="min-w-0">
              <p className="text-subdued text-xs">{t("RoutineDetail.owner")}</p>

              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium">{ownerName ?? t("RoutineDetail.ownerUnavailable")}</p>

                {form.owner && !ownerAvailable && (
                  <AppChip size="sm" variant={USER_STATUS_COLORS_MAP[form.owner.status]}>
                    {t(`Common.userStatuses.${form.owner.status}`)}
                  </AppChip>
                )}
              </div>
            </div>
          </div>

          {store.isReadOnly && (
            <Alert
              color="default"
              description={
                store.isOwner && !store.canManage
                  ? t("RoutineDetail.ownerPermissionReadOnly")
                  : ownerAvailable && ownerName
                    ? t("RoutineDetail.ownerOnlyEdit", { owner: ownerName })
                    : t("RoutineDetail.ownerUnavailableReadOnly")
              }
              title={t("RoutineDetail.readOnlyTitle")}
            />
          )}

          {store.canAdministerOtherRoutine && (
            <div className="space-y-3 border-t pt-3">
              <div>
                <p className="text-sm font-medium">{t("RoutineAdministration.title")}</p>

                <p className="text-subdued text-xs">{t("RoutineAdministration.help")}</p>
              </div>

              {form.enabled && (
                <Button
                  disabled={store.isLoading}
                  id="routine-admin-pause"
                  type="button"
                  variant="secondary"
                  onClick={onPause}
                >
                  <Pause className="size-4" />

                  {t("RoutineAdministration.pause")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {store.canManage ? (
        <label
          data-routine-enabled-field
          className="bg-muted/40 flex cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border px-4 py-3 transition-colors hover:bg-accent focus-within:ring-[3px] focus-within:ring-ring/50"
          htmlFor="enabled"
        >
          <FormSwitch containerClassName="shrink-0" id="enabled" />

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {form.enabled ? t("RoutineModal.enabled") : t("RoutineModal.disabled")}
            </p>

            <p className="text-subdued text-xs">
              {form.enabled ? t("RoutineModal.enabledHelp") : t("RoutineModal.pausedHelp")}
            </p>
          </div>
        </label>
      ) : (
        <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border px-4 py-3">
          <AppChip size="sm" variant={form.enabled ? "success" : "secondary"}>
            {form.enabled ? t("RoutineModal.enabled") : t("RoutineModal.disabled")}
          </AppChip>

          <p className="text-subdued min-w-0 flex-1 text-xs">
            {form.enabled ? t("RoutineModal.enabledHelp") : t("RoutineModal.pausedHelp")}
          </p>
        </div>
      )}

      <FormInput required id="name" />

      <FormTextarea
        required
        id="prompt"
        placeholder={scheduled ? t("RoutineModal.promptExampleSchedule") : t("RoutineModal.promptExampleEvent")}
        rows={4}
      />

      {routineContractReview(form.prompt ?? "").length > 0 && (
        <Alert
          color="warning"
          description={t("RoutineDetail.contractReviewHelp")}
          title={t("RoutineDetail.contractReviewTitle")}
        />
      )}

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
            renderValue={(items) =>
              items.map((item) => <AppChip key={item.key}>{t(`Common.events.${item.key}`)}</AppChip>)
            }
            selectionMode="multiple"
          >
            {(item) => <span>{t(`Common.events.${item.key}`)}</span>}
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

                    {source.events.map((event) => t(`Common.events.${event}`)).join(", ")}
                  </AppChip>
                ))}
              </div>
            ) : (
              <RoutineRecordTrigger store={store} />
            ))}
        </div>
      )}
    </section>
  );
});
