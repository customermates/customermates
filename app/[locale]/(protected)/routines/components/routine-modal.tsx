"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronDown, Trash2 } from "lucide-react";

import { RoutineTriggerKind } from "@/generated/prisma";

import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormSelect } from "@/components/forms/form-select";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormActions } from "@/components/card/form-actions";
import { AppChip } from "@/components/chip/app-chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import { ROUTINE_SCHEDULE_PRESETS } from "@/ee/routines/routine-schedule-preset";

const TRIGGER_EVENT_ITEMS = WebhookEventSchema.options.map((event) => ({ key: event }));

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour));
const MINUTES = ["0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, index) => String(index + 1));

function padded(value: string) {
  return value.padStart(2, "0");
}

export const RoutineModal = observer(() => {
  const t = useTranslations();
  const { routineModalStore } = useRootStore();
  const { form, canManage, isDisabled } = routineModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();

  const scheduled = form?.triggerKind === RoutineTriggerKind.schedule;
  const preset = form?.schedulePreset ?? "daily";

  return (
    <AppModal
      actions={
        form?.id && canManage
          ? [
              {
                id: "delete-routine",
                label: t("Common.actions.delete"),
                icon: Trash2,
                variant: "destructive",
                disabled: isDisabled,
                onClick: () => showDeleteConfirmation(() => routineModalStore.delete()),
              },
            ]
          : []
      }
      store={routineModalStore}
      title={t("RoutineModal.title")}
    >
      <AppForm store={routineModalStore}>
        <AppCard>
          <AppCardHeader>
            <h2 className="truncate text-x-lg">{t("RoutineModal.title")}</h2>

            <FormSwitch
              containerClassName="ml-auto w-auto shrink-0"
              id="enabled"
              label={t("RoutineModal.enabled")}
              size="sm"
            />
          </AppCardHeader>

          <AppCardBody>
            <FormInput required id="name" />

            <div className="space-y-1.5">
              <FormTextarea required id="prompt" rows={4} />

              <p className="text-subdued text-xs">{t("RoutineModal.promptDescription")}</p>
            </div>

            <FormSelect
              required
              id="triggerKind"
              items={[
                { value: RoutineTriggerKind.schedule, label: t("RoutineTriggerKind.schedule") },
                { value: RoutineTriggerKind.event, label: t("RoutineTriggerKind.event") },
              ]}
            />

            {scheduled ? (
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
                      items={WEEKDAY_KEYS.map((key, index) => ({
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
                      items={DAYS_OF_MONTH.map((value) => ({ value, label: value }))}
                      label={null}
                    />
                  )}

                  {preset !== "custom" && (
                    <>
                      <span className="text-subdued pb-2.5 text-xs">
                        {preset === "hourly" ? t("RoutineModal.onMinute") : t("RoutineModal.at")}
                      </span>

                      {preset !== "hourly" && (
                        <FormSelect
                          containerClassName="w-20"
                          id="scheduleHour"
                          items={HOURS.map((value) => ({ value, label: padded(value) }))}
                          label={null}
                        />
                      )}

                      <FormSelect
                        containerClassName="w-20"
                        id="scheduleMinute"
                        items={MINUTES.map((value) => ({ value, label: padded(value) }))}
                        label={null}
                      />
                    </>
                  )}
                </div>

                {preset === "custom" && <FormInput required id="cronExpression" />}

                <p className="text-subdued text-xs">{t("RoutineModal.scheduleDescription")}</p>
              </div>
            ) : (
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
            )}

            <Collapsible className="border-t pt-3">
              <CollapsibleTrigger className="text-subdued group flex w-full items-center gap-1.5 text-xs font-medium">
                <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />

                {t("RoutineModal.advanced")}
              </CollapsibleTrigger>

              <CollapsibleContent className="space-y-3 pt-3">
                {scheduled && <FormInput id="timezone" />}

                <div className="flex flex-wrap gap-3">
                  <FormNumberInput containerClassName="min-w-44 flex-1" id="maxRunsPerHour" />

                  <FormNumberInput containerClassName="min-w-44 flex-1" id="maxCreditsPerRun" />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </AppCardBody>

          <FormActions anchorScope="routine-modal" store={routineModalStore} />
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
