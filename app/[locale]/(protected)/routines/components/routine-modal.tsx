"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronLeft, Loader2, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { RoutineTriggerKind } from "@/generated/prisma";

import type { AppModalActionProps, AppModalActions } from "@/components/modal";

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
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
import { useChangeFieldLabel } from "@/components/entity-terminology/use-change-field-label";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { ROUTINE_TRIGGER_EVENTS } from "@/ee/routines/routine.schema";
import {
  ROUTINE_SCHEDULE_PRESETS,
  ROUTINE_WEEKDAY_KEYS,
  describeRoutineSchedule,
  scheduleHasClockTime,
} from "@/ee/routines/routine-schedule-preset";
import { ROUTINE_RUN_STATUS_CHIP_COLOR } from "@/ee/routines/routine-run-chip-colors";
import { routineRunDetail } from "@/ee/routines/routine-run-outcome";
import { USER_STATUS_COLORS_MAP } from "@/constants/user-statuses";
import { AgentChatStoreProvider } from "@/app/components/agent-chat/agent-chat-store-context";
import { AgentConversationLog } from "@/app/components/agent-chat/agent-conversation";
import { MessageResponse } from "@/components/ai-elements/message";

const TRIGGER_EVENT_ITEMS = ROUTINE_TRIGGER_EVENTS.map((event) => ({
  key: event,
}));

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour));
const MINUTES = ["0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, index) => String(index + 1));

function padded(value: string) {
  return value.padStart(2, "0");
}

function RoutineTabPanel({
  children,
  enabled,
  value,
}: {
  children: ReactNode;
  enabled: boolean;
  value: "details" | "runs";
}) {
  if (!enabled) return <>{children}</>;

  return (
    <TabsContent className="mt-0" value={value}>
      {children}
    </TabsContent>
  );
}

export const RoutineModal = observer(() => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { routineModalStore, routineRunChatStore } = useRootStore();
  const { form } = routineModalStore;
  const { showConfirmation, showDeleteConfirmation } = useDeleteConfirmation();

  const scheduled = form?.triggerKind === RoutineTriggerKind.schedule;
  const eventTriggered = form?.triggerKind === RoutineTriggerKind.event;
  const preset = form?.schedulePreset ?? "daily";
  const scheduleSummary = describeRoutineSchedule(routineModalStore.compiledCron, t, (date) =>
    intlStore.formatTime(date),
  );
  const hasClockTime = scheduleHasClockTime(routineModalStore.compiledCron);
  const changeFieldLabel = useChangeFieldLabel();
  const filterableFields = routineModalStore.filterableFields;
  const changedFieldItems = routineModalStore.changeFields.map((field) => ({
    key: field,
  }));
  const hasChangedFieldRows = changedFieldItems.length > 0 || (form?.changedFields?.length ?? 0) > 0;
  const hasTriggerFilterRows = filterableFields.length > 0 || (form?.triggerFilters?.length ?? 0) > 0;
  const changedFieldLabel = (key: string) => changeFieldLabel(key, routineModalStore.customColumns);

  const isExistingRoutine = Boolean(form?.id);
  const openRun = routineModalStore.openRun_;
  const showRuns = isExistingRoutine && routineModalStore.activeTab === "runs";
  const ownerName = form.owner ? `${form.owner.firstName} ${form.owner.lastName}`.trim() : null;
  const ownerAvailable = routineModalStore.hasAvailableOwner;
  const testTooltip = eventTriggered
    ? t("RoutineDetail.testTriggerEventUnavailable")
    : !form.enabled
      ? t("RoutineDetail.testTriggerEnableFirst")
      : routineModalStore.hasUnsavedChanges
        ? t("RoutineDetail.testTriggerSaveFirst")
        : t("RoutineDetail.testTriggerWarning");
  const disabledReasonCopy =
    routineModalStore.disabledReason === "repeatedFailures"
      ? routineModalStore.isOwner
        ? t("RoutineDetail.disabledRepeatedFailures")
        : ownerAvailable
          ? t("RoutineDetail.disabledRepeatedFailuresReadOnly")
          : t("RoutineDetail.disabledOwnerUnavailable")
      : routineModalStore.disabledReason === "adminPaused"
        ? t("RoutineDetail.disabledAdminPaused")
        : routineModalStore.disabledReason === "ownerUnavailable"
          ? t("RoutineDetail.disabledOwnerUnavailable")
          : routineModalStore.disabledReason === "ownerPaused"
            ? t("RoutineDetail.disabledOwnerPaused")
            : t("RoutineDetail.disabledGeneric");

  const testAction: AppModalActionProps = {
    id: "routines-run-now",
    label: t("RoutineDetail.testTrigger"),
    tooltip: testTooltip,
    icon: routineModalStore.isStartingRun ? RefreshCw : Play,
    busy: routineModalStore.isStartingRun,
    disabled:
      eventTriggered ||
      !routineModalStore.isOwner ||
      !form.enabled ||
      routineModalStore.isLoading ||
      routineModalStore.hasUnsavedChanges,
    onClick: routineModalStore.runNow,
  };
  const deleteAction: AppModalActionProps = {
    id: "delete-routine",
    label: t("Common.actions.delete"),
    icon: Trash2,
    variant: "destructive",
    disabled: routineModalStore.isLoading,
    onClick: () => showDeleteConfirmation(() => routineModalStore.delete(), form.name),
  };
  const modalActions: AppModalActions = openRun
    ? [
        {
          id: "routine-run-back",
          label: t("Common.actions.back"),
          icon: ChevronLeft,
          onClick: routineModalStore.closeRun,
        },
      ]
    : !isExistingRoutine
      ? []
      : routineModalStore.isOwner
        ? routineModalStore.isAdmin
          ? [testAction, deleteAction]
          : [testAction]
        : routineModalStore.isAdmin
          ? [deleteAction]
          : [];

  const confirmPause = () =>
    showConfirmation({
      title: t("RoutineAdministration.pauseTitle"),
      message: t("RoutineAdministration.pauseConfirmation", {
        name: form.name ?? "",
      }),
      confirmLabel: t("RoutineAdministration.pause"),
      confirmVariant: "default",
      successKey: "Common.notifications.updated",
      onConfirm: routineModalStore.pause,
    });

  return (
    <AppModal actions={modalActions} size="lg" store={routineModalStore} title={t("RoutineModal.title")}>
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

                  <span className="text-subdued text-xs">
                    {t("RoutineDetail.ranAs", {
                      owner: openRun.executedByName,
                    })}
                  </span>

                  <span className="text-subdued ml-auto text-xs">
                    {`${t("RoutineDetail.credits")}: ${openRun.chargedCredits}`}
                  </span>
                </div>

                {openRun.conversationId && routineModalStore.canOpenRun(openRun) ? (
                  <AgentConversationLog readOnly />
                ) : (
                  <div className="flex flex-1 items-center justify-center p-6">
                    <p className="text-subdued text-center text-sm">
                      {openRun.conversationId
                        ? t("RoutineDetail.transcriptOwnerOnly", {
                            owner: openRun.executedByName,
                          })
                        : routineRunDetail(openRun, t)}
                    </p>
                  </div>
                )}
              </div>
            </AgentChatStoreProvider>
          ) : (
            <Tabs
              className="gap-0"
              value={routineModalStore.activeTab}
              onValueChange={(value) => routineModalStore.setActiveTab(value as "details" | "runs")}
            >
              {isExistingRoutine && (
                <div className="px-6 pt-4">
                  <TabsList variant="segmented">
                    <TabsTrigger id="routine-tab-details" value="details">
                      {t("RoutineModal.detailsTab")}
                    </TabsTrigger>

                    <TabsTrigger id="routine-tab-runs" value="runs">
                      {t("RoutineDetail.runs")}
                    </TabsTrigger>
                  </TabsList>
                </div>
              )}

              {showRuns ? (
                <RoutineTabPanel enabled={isExistingRoutine} value="runs">
                  <AppCardBody>
                    {routineModalStore.isRunsLoading ? (
                      <Spinner aria-label={t("PageState.loading")} />
                    ) : routineModalStore.runs.length === 0 ? (
                      <p className="text-subdued py-8 text-center text-sm">{t("RoutineDetail.noRuns")}</p>
                    ) : (
                      <>
                        <div className="space-y-1" role="list">
                          {routineModalStore.runs.map((run) => {
                            const transcriptRestricted =
                              Boolean(run.conversationId) && !routineModalStore.canOpenRun(run);
                            const runContent = (
                              <span className="flex w-full min-w-0 items-start gap-3">
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-baseline gap-2">
                                    <span className="truncate text-sm font-medium">
                                      {run.triggerEvent
                                        ? t(`Common.events.${run.triggerEvent}`)
                                        : t(`RoutineTriggerKind.${run.triggerKind}`)}
                                    </span>

                                    {run.chargedCredits > 0 && (
                                      <span className="text-subdued shrink-0 text-xs font-normal">
                                        {`${t("RoutineDetail.credits")}: ${run.chargedCredits}`}
                                      </span>
                                    )}
                                  </span>

                                  <span className="text-subdued mt-0.5 block text-xs font-normal">
                                    {t("RoutineDetail.ranAs", {
                                      owner: run.executedByName,
                                    })}
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
                            );
                            const runButton = (
                              <Button
                                className="h-auto w-full min-w-0 flex-1 justify-start rounded-lg px-3 py-2.5 text-left"
                                id={`routine-run-${run.id}`}
                                variant="ghost"
                                onClick={() => runUserAction(() => routineModalStore.openRun(run))}
                              >
                                {runContent}
                              </Button>
                            );

                            return (
                              <div
                                key={run.id}
                                className="group flex items-center gap-1 overflow-hidden rounded-lg border"
                                role="listitem"
                              >
                                {transcriptRestricted ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        aria-disabled="true"
                                        className="flex h-auto w-full min-w-0 flex-1 cursor-not-allowed justify-start rounded-lg px-3 py-2.5 text-left opacity-50"
                                        id={`routine-run-${run.id}`}
                                        role="button"
                                        tabIndex={0}
                                      >
                                        {runContent}
                                      </span>
                                    </TooltipTrigger>

                                    <TooltipContent>
                                      {t("RoutineDetail.transcriptOwnerOnly", {
                                        owner: run.executedByName,
                                      })}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  runButton
                                )}
                              </div>
                            );
                          })}
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
                </RoutineTabPanel>
              ) : (
                <RoutineTabPanel enabled={isExistingRoutine} value="details">
                  <AppCardBody>
                    {isExistingRoutine && (
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
                              <p className="truncate text-sm font-medium">
                                {ownerName ?? t("RoutineDetail.ownerUnavailable")}
                              </p>

                              {form.owner && !ownerAvailable && (
                                <AppChip size="sm" variant={USER_STATUS_COLORS_MAP[form.owner.status]}>
                                  {t(`Common.userStatuses.${form.owner.status}`)}
                                </AppChip>
                              )}
                            </div>
                          </div>
                        </div>

                        {!routineModalStore.isOwner && (
                          <Alert
                            color="default"
                            description={
                              ownerAvailable && ownerName
                                ? t("RoutineDetail.ownerOnlyEdit", {
                                    owner: ownerName,
                                  })
                                : t("RoutineDetail.ownerUnavailableReadOnly")
                            }
                            title={t("RoutineDetail.readOnlyTitle")}
                          />
                        )}

                        {routineModalStore.canAdministerOtherRoutine && (
                          <div className="space-y-3 border-t pt-3">
                            <div>
                              <p className="text-sm font-medium">{t("RoutineAdministration.title")}</p>

                              <p className="text-subdued text-xs">{t("RoutineAdministration.help")}</p>
                            </div>

                            {form.enabled && (
                              <Button
                                disabled={routineModalStore.isLoading}
                                id="routine-admin-pause"
                                type="button"
                                variant="secondary"
                                onClick={confirmPause}
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
                      {routineModalStore.isOwner ? (
                        <FormSwitch
                          containerClassName="shrink-0"
                          id="enabled"
                          label={form?.enabled ? t("RoutineModal.enabled") : t("RoutineModal.disabled")}
                        />
                      ) : (
                        <AppChip size="sm" variant={form.enabled ? "success" : "secondary"}>
                          {form.enabled ? t("RoutineModal.enabled") : t("RoutineModal.disabled")}
                        </AppChip>
                      )}

                      <p className="text-subdued min-w-0 flex-1 text-xs">{t("RoutineModal.enabledHelp")}</p>
                    </div>

                    {!form.enabled && routineModalStore.disabledReason && (
                      <Alert color="warning">
                        <p className="text-x-sm font-medium">{t("RoutineDetail.disabledTitle")}</p>

                        <p className="text-x-sm">{disabledReasonCopy}</p>
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
                            expression: form?.cronExpression ?? "",
                          })}
                        </p>

                        <Button
                          disabled={!routineModalStore.canManage}
                          size="sm"
                          variant="secondary"
                          onClick={routineModalStore.useSchedulePreset}
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

                        <p className="text-subdued text-xs">{t("RoutineModal.eventSuppressionNote")}</p>

                        {hasChangedFieldRows && (
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

                        {hasTriggerFilterRows && (
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

                  <FormActions showInitially anchorScope="routine-modal" store={routineModalStore} />
                </RoutineTabPanel>
              )}
            </Tabs>
          )}
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
