"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronLeft, Loader2, Play, RefreshCw, Trash2 } from "lucide-react";

import { RoutineTriggerKind } from "@/generated/prisma";

import type { AppModalActions } from "@/components/modal";

import { AppModal } from "@/components/modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormTextarea } from "@/components/forms/form-textarea";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormSelect } from "@/components/forms/form-select";
import { FormLabel } from "@/components/forms/form-label";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormActions } from "@/components/card/form-actions";
import { AppChip } from "@/components/chip/app-chip";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
import { useChangeFieldLabel } from "@/components/entity-terminology/use-change-field-label";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import {
  ROUTINE_SCHEDULE_PRESETS,
  ROUTINE_WEEKDAY_KEYS,
  describeRoutineSchedule,
  scheduleHasClockTime,
} from "@/ee/routines/routine-schedule-preset";
import { ROUTINE_RUN_STATUS_CHIP_COLOR } from "@/ee/routines/routine-run-chip-colors";
import { routineRunDetail } from "@/ee/routines/routine-run-outcome";
import { AgentChatStoreProvider } from "@/app/components/agent-chat/agent-chat-store-context";
import { AgentComposer, AgentConversationLog } from "@/app/components/agent-chat/agent-conversation";
import { MessageResponse } from "@/components/ai-elements/message";

const TRIGGER_EVENT_ITEMS = WebhookEventSchema.options.map((event) => ({ key: event }));

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour));
const MINUTES = ["0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, index) => String(index + 1));

function padded(value: string) {
  return value.padStart(2, "0");
}

export const RoutineModal = observer(() => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { routineModalStore, routineRunChatStore } = useRootStore();
  const { form, canManage, isDisabled } = routineModalStore;
  const { showDeleteConfirmation } = useDeleteConfirmation();

  const scheduled = form?.triggerKind === RoutineTriggerKind.schedule;
  const preset = form?.schedulePreset ?? "daily";
  const scheduleSummary = describeRoutineSchedule(routineModalStore.compiledCron, t, (date) =>
    intlStore.formatTime(date),
  );
  const hasClockTime = scheduleHasClockTime(routineModalStore.compiledCron);
  const changeFieldLabel = useChangeFieldLabel();
  const filterableFields = routineModalStore.filterableFields;
  const changedFieldItems = routineModalStore.changeFields.map((field) => ({ key: field }));
  const changedFieldLabel = (key: string) => changeFieldLabel(key, routineModalStore.customColumns);

  const isExistingRoutine = Boolean(form?.id);
  const openRun = routineModalStore.openRun_;
  const showRuns = isExistingRoutine && routineModalStore.activeTab === "runs";

  const modalActions: AppModalActions = openRun
    ? [
        {
          id: "routine-run-back",
          label: t("Common.actions.back"),
          icon: ChevronLeft,
          onClick: routineModalStore.closeRun,
        },
      ]
    : isExistingRoutine && canManage
      ? [
          {
            id: "routines-run-now",
            label: t("RoutineDetail.runNow"),
            icon: routineModalStore.isStartingRun ? RefreshCw : Play,
            busy: routineModalStore.isStartingRun,
            disabled: isDisabled || routineModalStore.hasUnsavedChanges,
            onClick: routineModalStore.runNow,
          },
          {
            id: "delete-routine",
            label: t("Common.actions.delete"),
            icon: Trash2,
            variant: "destructive",
            disabled: isDisabled,
            onClick: () => showDeleteConfirmation(() => routineModalStore.delete()),
          },
        ]
      : [];

  return (
    <AppModal actions={modalActions} store={routineModalStore} title={t("RoutineModal.title")}>
      <AppForm store={routineModalStore}>
        <AppCard>
          <AppCardHeader>
            <h2 className="truncate text-x-lg">{form?.name?.trim() || t("RoutineModal.title")}</h2>
          </AppCardHeader>

          {openRun ? (
            <AgentChatStoreProvider store={routineRunChatStore}>
              <div className="flex min-h-[26rem] flex-col">
                <div className="flex items-center gap-2 border-b px-6 py-2.5">
                  <span className="text-sm">{intlStore.formatNumericalShortDateTime(openRun.createdAt)}</span>

                  <AppChip size="sm" variant={ROUTINE_RUN_STATUS_CHIP_COLOR[openRun.status]}>
                    {t(`RoutineRunStatus.${openRun.status}`)}
                  </AppChip>

                  <span className="text-subdued ml-auto text-xs">
                    {`${t("RoutineDetail.credits")}: ${openRun.chargedCredits}`}
                  </span>
                </div>

                {openRun.conversationId ? (
                  <>
                    <AgentConversationLog />

                    <AgentComposer />
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center p-6">
                    <p className="text-subdued text-center text-sm">{routineRunDetail(openRun, t)}</p>
                  </div>
                )}
              </div>
            </AgentChatStoreProvider>
          ) : (
            <>
              {isExistingRoutine && (
                <div className="px-6 pt-4">
                  <Tabs
                    value={routineModalStore.activeTab}
                    onValueChange={(value) => routineModalStore.setActiveTab(value as "details" | "runs")}
                  >
                    <TabsList variant="segmented">
                      <TabsTrigger id="routine-tab-details" value="details">
                        {t("RoutineModal.detailsTab")}
                      </TabsTrigger>

                      <TabsTrigger id="routine-tab-runs" value="runs">
                        {t("RoutineDetail.runs")}
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}

              {showRuns ? (
                <AppCardBody>
                  {routineModalStore.isRunsLoading ? (
                    <Spinner aria-label={t("PageState.loading")} />
                  ) : routineModalStore.runs.length === 0 ? (
                    <p className="text-subdued py-8 text-center text-sm">{t("RoutineDetail.noRuns")}</p>
                  ) : (
                    <>
                      <div className="space-y-1" role="list">
                        {routineModalStore.runs.map((run) => (
                          <div
                            key={run.id}
                            className="group flex items-center gap-1 overflow-hidden rounded-lg border"
                            role="listitem"
                          >
                            <Button
                              className="h-auto min-w-0 flex-1 justify-start rounded-lg px-3 py-2.5 text-left"
                              id={`routine-run-${run.id}`}
                              variant="ghost"
                              onClick={() => runUserAction(() => routineModalStore.openRun(run))}
                            >
                              <span className="flex w-full min-w-0 items-start gap-3">
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-baseline gap-2">
                                    <span suppressHydrationWarning className="truncate text-sm font-medium">
                                      {intlStore.formatNumericalShortDateTime(run.createdAt)}
                                    </span>

                                    {run.chargedCredits > 0 && (
                                      <span className="text-subdued shrink-0 text-xs font-normal">
                                        {`${t("RoutineDetail.credits")}: ${run.chargedCredits}`}
                                      </span>
                                    )}
                                  </span>

                                  {routineRunDetail(run, t) && (
                                    <MessageResponse className="text-subdued mt-0.5 line-clamp-2 text-xs font-normal">
                                      {routineRunDetail(run, t)}
                                    </MessageResponse>
                                  )}
                                </span>

                                <span className="flex shrink-0 flex-col items-end gap-1.5">
                                  <time
                                    suppressHydrationWarning
                                    className="text-subdued text-xs font-normal whitespace-nowrap"
                                  >
                                    {intlStore.formatRelativeTime(run.createdAt)}
                                  </time>

                                  <AppChip size="sm" variant={ROUTINE_RUN_STATUS_CHIP_COLOR[run.status]}>
                                    {t(`RoutineRunStatus.${run.status}`)}
                                  </AppChip>
                                </span>
                              </span>
                            </Button>
                          </div>
                        ))}
                      </div>

                      {routineModalStore.runsNextCursor && (
                        <Button
                          className="mt-2 w-full"
                          disabled={routineModalStore.isLoadingMoreRuns}
                          id="routine-runs-load-more"
                          size="sm"
                          variant="ghost"
                          onClick={() => runUserAction(routineModalStore.loadMoreRuns)}
                        >
                          {routineModalStore.isLoadingMoreRuns && <Loader2 className="size-3.5 animate-spin" />}

                          {t("Common.actions.loadMore")}
                        </Button>
                      )}
                    </>
                  )}
                </AppCardBody>
              ) : (
                <AppCardBody>
                  <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border px-4 py-3">
                    <FormSwitch
                      containerClassName="shrink-0"
                      id="enabled"
                      label={form?.enabled ? t("RoutineModal.enabled") : t("RoutineModal.disabled")}
                    />

                    <p className="text-subdued min-w-0 flex-1 text-xs">{t("RoutineModal.enabledHelp")}</p>
                  </div>

                  {routineModalStore.disabledReason && (
                    <Alert color="warning">
                      <p className="text-x-sm font-medium">{t("RoutineDetail.disabledTitle")}</p>

                      <p className="text-x-sm">{t("RoutineDetail.disabledRepeatedFailures")}</p>
                    </Alert>
                  )}

                  {routineModalStore.risks.length > 0 && (
                    <Alert color="warning">
                      <p className="text-x-sm font-medium">{t("RoutineDetail.loopWarningTitle")}</p>

                      <p className="text-x-sm">
                        {routineModalStore.risks.some((risk) => risk.kind === "selfLoop")
                          ? t("RoutineDetail.loopWarningSelf")
                          : t("RoutineDetail.loopWarningMutual")}
                      </p>
                    </Alert>
                  )}

                  <FormInput required id="name" />

                  <FormTextarea
                    required
                    id="prompt"
                    placeholder={
                      scheduled ? t("RoutineModal.promptExampleSchedule") : t("RoutineModal.promptExampleEvent")
                    }
                    rows={4}
                  />

                  <FormSelect
                    required
                    id="triggerKind"
                    items={[
                      { value: RoutineTriggerKind.schedule, label: t("RoutineTriggerKind.schedule") },
                      { value: RoutineTriggerKind.event, label: t("RoutineTriggerKind.event") },
                    ]}
                  />

                  {scheduled && preset === "custom" ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                      <p className="text-x-sm flex-1">
                        {t("RoutineModal.customSchedule", { expression: form?.cronExpression ?? "" })}
                      </p>

                      <Button size="sm" variant="secondary" onClick={routineModalStore.useSchedulePreset}>
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
                            items={DAYS_OF_MONTH.map((value) => ({ value, label: value }))}
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

                      {hasClockTime && (
                        <p className="text-subdued text-xs">
                          {`${scheduleSummary} · ${t("RoutineModal.scheduleTimeZone", { timezone: form?.timezone ?? "" })}`}
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

                      {changedFieldItems.length > 0 && (
                        <div className="space-y-1.5">
                          <FormAutocomplete
                            id="changedFields"
                            items={changedFieldItems}
                            renderValue={(items) =>
                              items.map((item) => <AppChip key={item.key}>{changedFieldLabel(item.key)}</AppChip>)
                            }
                            selectionMode="multiple"
                          >
                            {(item) => <span>{changedFieldLabel(item.key)}</span>}
                          </FormAutocomplete>

                          <p className="text-subdued text-xs">{t("RoutineModal.changedFieldsHelp")}</p>
                        </div>
                      )}

                      {filterableFields.length > 0 && (
                        <div className="space-y-1.5">
                          <FormLabel>{t("Common.inputs.triggerFilters")}</FormLabel>

                          <FilterAccordion
                            baseId="triggerFilters"
                            customColumns={routineModalStore.customColumns}
                            filterableFields={filterableFields}
                            filters={(form?.triggerFilters as never) ?? []}
                            variant="grouped"
                          />

                          <p className="text-subdued text-xs">{t("RoutineModal.triggerFiltersHelp")}</p>
                        </div>
                      )}
                    </div>
                  )}
                </AppCardBody>
              )}

              {!showRuns && <FormActions showInitially anchorScope="routine-modal" store={routineModalStore} />}
            </>
          )}
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
