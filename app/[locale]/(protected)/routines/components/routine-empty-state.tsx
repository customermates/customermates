"use client";

import type { RoutineModalStore } from "./routine-modal.store";
import type { RoutineTriggerGuidanceAction } from "@/ee/routines/routine-trigger-guidance";

import { observer } from "mobx-react-lite";
import { useLocale, useTranslations } from "next-intl";
import { History } from "lucide-react";

import { RoutineTriggerKind } from "@/generated/prisma";

import { useChangeFieldLabel } from "@/components/entity-terminology/use-change-field-label";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { orderedRoutineTriggerGuidance } from "@/ee/routines/routine-trigger-guidance";
import { describeRoutineSchedule, scheduleHasClockTime } from "@/ee/routines/routine-schedule-preset";
import { terminologyLabelForSentence } from "@/features/entity-terminology/entity-terminology-label.utils";

function actionCopy(
  action: RoutineTriggerGuidanceAction,
  entity: string | null,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (action) {
    case "recordCreated":
      return t("RoutineDetail.empty.event.actions.recordCreated", {
        entity: entity ?? "",
      });
    case "recordUpdated":
      return t("RoutineDetail.empty.event.actions.recordUpdated", {
        entity: entity ?? "",
      });
    case "recordDeleted":
      return t("RoutineDetail.empty.event.actions.recordDeleted", {
        entity: entity ?? "",
      });
    case "messageReceived":
      return t("RoutineDetail.empty.event.actions.messageReceived");
    case "messageUpdated":
      return t("RoutineDetail.empty.event.actions.messageUpdated");
    case "messageDeleted":
      return t("RoutineDetail.empty.event.actions.messageDeleted");
    case "messageReaction":
      return t("RoutineDetail.empty.event.actions.messageReaction");
    case "emailReceived":
      return t("RoutineDetail.empty.event.actions.emailReceived");
    case "chatUpdated":
      return t("RoutineDetail.empty.event.actions.chatUpdated");
    case "calendarChanged":
      return t("RoutineDetail.empty.event.actions.calendarChanged");
    case "calendarEventChanged":
      return t("RoutineDetail.empty.event.actions.calendarEventChanged");
    case "relationCreated":
      return t("RoutineDetail.empty.event.actions.relationCreated");
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export const RoutineEmptyState = observer(({ store }: { store: RoutineModalStore }) => {
  const locale = useLocale();
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { singular } = useEntityTerminology();
  const changeFieldLabel = useChangeFieldLabel();
  const { form } = store;
  const scheduled = form.triggerKind === RoutineTriggerKind.schedule;

  if (scheduled) {
    const schedule = describeRoutineSchedule(store.compiledCron, t, (date) => intlStore.formatTime(date));
    const scheduleDescription = scheduleHasClockTime(store.compiledCron)
      ? `${schedule} · ${t("RoutineModal.scheduleTimeZone", { timezone: form.timezone ?? "" })}`
      : schedule;
    const testDescription = !store.canManage
      ? store.isOwner
        ? t("RoutineDetail.ownerPermissionReadOnly")
        : t("RoutineDetail.empty.schedule.ownerOnly")
      : !form.enabled
        ? t("RoutineDetail.empty.schedule.activateFirst")
        : store.hasUnsavedChanges
          ? t("RoutineDetail.empty.schedule.saveFirst")
          : t("RoutineDetail.empty.schedule.testNow");

    return (
      <div
        className="flex min-h-64 flex-col items-center justify-center gap-3 px-4 py-8 text-center"
        data-routine-runs-empty="schedule"
      >
        <History aria-hidden="true" className="text-subdued size-8 opacity-50" />

        <div className="max-w-md space-y-1">
          <h4 className="text-sm font-medium">{t("RoutineDetail.empty.title")}</h4>

          <p className="text-subdued text-sm">{t("RoutineDetail.empty.schedule.description")}</p>

          <p className="text-sm font-medium">{scheduleDescription}</p>

          <p className="text-subdued text-xs">{testDescription}</p>
        </div>
      </div>
    );
  }

  const watchedFields = (form.changedFields ?? []).map((field) => changeFieldLabel(field, store.customColumns));
  const watchedFieldsList = new Intl.ListFormat(intlStore.resolvedFormattingLanguageTag, {
    style: "long",
    type: "disjunction",
  }).format(watchedFields);
  const hasFilters = (store.payload.triggerFilters?.length ?? 0) > 0;
  const eventGuidance = orderedRoutineTriggerGuidance(form.triggerEvents ?? []);
  const hasDeletionEvent = eventGuidance.some(({ guidance }) => guidance.action === "recordDeleted");

  return (
    <div
      className="flex min-h-64 flex-col items-center justify-center gap-4 px-4 py-8 text-center"
      data-routine-runs-empty="event"
    >
      <History aria-hidden="true" className="text-subdued size-8 opacity-50" />

      <div className="max-w-lg space-y-1">
        <h4 className="text-sm font-medium">{t("RoutineDetail.empty.title")}</h4>

        <p className="text-subdued text-sm">{t("RoutineDetail.empty.event.description")}</p>
      </div>

      <ul aria-label={t("RoutineDetail.empty.event.instructionsLabel")} className="w-full max-w-lg space-y-2 text-left">
        {eventGuidance.map(({ event, guidance }) => {
          const entity = guidance.entityType
            ? terminologyLabelForSentence(singular(guidance.entityType), locale)
            : null;

          return (
            <li key={event} className="rounded-lg border px-3 py-2.5">
              <p className="text-sm font-medium">{t(`Common.events.${event}`)}</p>

              <p className="text-subdued mt-0.5 text-xs">{actionCopy(guidance.action, entity, t)}</p>
            </li>
          );
        })}
      </ul>

      <div className="text-subdued w-full max-w-lg space-y-1.5 text-left text-xs">
        {!form.enabled && <p>{t("RoutineDetail.empty.event.conditions.paused")}</p>}

        {store.hasUnsavedChanges && <p>{t("RoutineDetail.empty.event.conditions.unsaved")}</p>}

        {watchedFields.length > 0 && (
          <p>
            {t("RoutineDetail.empty.event.conditions.watchedFields", {
              fields: watchedFieldsList,
            })}
          </p>
        )}

        {hasFilters && !hasDeletionEvent && <p>{t("RoutineDetail.empty.event.conditions.filters")}</p>}

        {hasFilters && hasDeletionEvent && <p>{t("RoutineDetail.empty.event.conditions.filtersWithDeletion")}</p>}

        <p>{t("RoutineDetail.empty.event.conditions.ownerAccess")}</p>

        <p>{t("RoutineDetail.empty.event.conditions.suppression")}</p>
      </div>
    </div>
  );
});
