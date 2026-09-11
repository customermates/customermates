"use client";

import type { RoutineModalStore } from "./routine-modal.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Pause } from "lucide-react";

import { RoutineTriggerKind } from "@/generated/prisma";

import { Alert } from "@/components/shared/alert";
import { AppChip } from "@/components/chip/app-chip";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormInput } from "@/components/forms/form-input";
import { FormLabel } from "@/components/forms/form-label";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormTextarea } from "@/components/forms/form-textarea";
import { useChangeFieldLabel } from "@/components/entity-terminology/use-change-field-label";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine.schema";
import {
  ROUTINE_SCHEDULE_PRESETS,
  ROUTINE_WEEKDAY_KEYS,
  describeRoutineSchedule,
  scheduleHasClockTime,
} from "@/ee/routines/routine-schedule-preset";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";

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
  const changeFieldLabel = useChangeFieldLabel();
  const filterableFields = store.filterableFields;
  const changedFieldItems = store.changeFields.map((field) => ({
    key: field,
  }));
  const hasChangedFieldRows = changedFieldItems.length > 0 || (form.changedFields?.length ?? 0) > 0;
  const hasTriggerFilterRows = filterableFields.length > 0 || (form.triggerFilters?.length ?? 0) > 0;
  const ownerName = form.owner ? `${form.owner.firstName} ${form.owner.lastName}`.trim() : null;
  const ownerAvailable = store.hasAvailableOwner;
  const disabledReasonCopy =
    store.disabledReason === "repeatedFailures"
      ? store.canManage
        ? t("RoutineDetail.disabledRepeatedFailures")
        : ownerAvailable
          ? t("RoutineDetail.disabledRepeatedFailuresReadOnly")
          : t("RoutineDetail.disabledOwnerUnavailable")
      : store.disabledReason === "adminPaused"
        ? t("RoutineDetail.disabledAdminPaused")
        : store.disabledReason === "ownerUnavailable"
          ? t("RoutineDetail.disabledOwnerUnavailable")
          : store.disabledReason === "ownerPaused"
            ? t("RoutineDetail.disabledOwnerPaused")
            : t("RoutineDetail.disabledGeneric");

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

      <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border px-4 py-3">
        {store.canManage ? (
          <FormSwitch
            containerClassName="shrink-0"
            id="enabled"
            label={form.enabled ? t("RoutineModal.enabled") : t("RoutineModal.disabled")}
          />
        ) : (
          <AppChip size="sm" variant={form.enabled ? "success" : "secondary"}>
            {form.enabled ? t("RoutineModal.enabled") : t("RoutineModal.disabled")}
          </AppChip>
        )}

        <p className="text-subdued min-w-0 flex-1 text-xs">{t("RoutineModal.enabledHelp")}</p>
      </div>

      {!form.enabled && store.disabledReason && (
        <Alert color="warning">
          <p className="text-x-sm font-medium">{t("RoutineDetail.disabledTitle")}</p>

          <p className="text-x-sm">{disabledReasonCopy}</p>
        </Alert>
      )}

      <FormInput required id="name" />

      <FormTextarea
        required
        id="prompt"
        placeholder={scheduled ? t("RoutineModal.promptExampleSchedule") : t("RoutineModal.promptExampleEvent")}
        rows={4}
      />

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

          {hasChangedFieldRows && (
            <div className="space-y-1.5">
              <FormAutocomplete
                id="changedFields"
                items={changedFieldItems}
                renderValue={(items) =>
                  items.map((item) => (
                    <AppChip key={item.key}>{changeFieldLabel(item.key, store.customColumns)}</AppChip>
                  ))
                }
                selectionMode="multiple"
              >
                {(item) => <span>{changeFieldLabel(item.key, store.customColumns)}</span>}
              </FormAutocomplete>

              <p className="text-subdued text-xs">{t("RoutineModal.changedFieldsHelp")}</p>
            </div>
          )}

          {hasTriggerFilterRows && (
            <div className="space-y-1.5">
              <FormLabel>{t("Common.inputs.triggerFilters")}</FormLabel>

              <FilterAccordion
                baseId="triggerFilters"
                customColumns={store.customColumns}
                filterableFields={filterableFields}
                filters={(form.triggerFilters as never) ?? []}
                variant="grouped"
              />

              <p className="text-subdued text-xs">{t("RoutineModal.triggerFiltersHelp")}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
});
