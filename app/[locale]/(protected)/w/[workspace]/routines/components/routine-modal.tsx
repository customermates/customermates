"use client";

import type { AutomationCanvasActions } from "@/components/automations/canvas/automation-canvas-types";
import type { AppModalActionProps, AppModalActions } from "@/components/modal";

import { Copy, Play, RefreshCw, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Action, RoutineTriggerKind } from "@/generated/prisma";

import { AgentChatStoreProvider } from "@/app/components/agent-chat/agent-chat-store-context";
import { AgentRouteReloadBridge } from "@/app/components/agent-chat/agent-route-reload";
import { AutomationCanvas } from "@/components/automations/canvas/automation-canvas";
import { AutomationDrawerShell } from "@/components/automations/canvas/automation-drawer-shell";
import { AutomationReplayBanner } from "@/components/automations/canvas/automation-replay-summary";
import { AutomationStepPanel } from "@/components/automations/canvas/automation-step-panel";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { AppForm } from "@/components/forms/form-context";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRouter } from "@/i18n/navigation";

import { RoutineAgentFields } from "./routine-agent-fields";
import { routineCanvasSteps } from "./routine-canvas-steps";
import { RoutineConfigurationPane } from "./routine-configuration-pane";
import { ROUTINE_RUN_CHAT_UI_TARGETS, RoutineRunDetail } from "./routine-run-detail";
import { RoutineRunsPane } from "./routine-runs-pane";
import { RoutineTriggerFields } from "./routine-trigger-fields";

export const RoutineModal = observer(() => {
  const t = useTranslations();
  const router = useRouter();
  const intlStore = useHydratedIntlStore();
  const { routineModalStore, routineRunChatStore } = useRootStore();
  const { form } = routineModalStore;
  const { showConfirmation, showTrashConfirmation } = useDeleteConfirmation();
  const runScrollRef = useRef<HTMLDivElement>(null);
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const isExistingRoutine = Boolean(form.id);
  const openRun = routineModalStore.openRun_;
  const eventTriggered = form.triggerKind === RoutineTriggerKind.event;
  const testTooltip = eventTriggered
    ? t("RoutineDetail.testTriggerEventUnavailable")
    : !form.enabled
      ? t("RoutineDetail.testTriggerEnableFirst")
      : routineModalStore.hasUnsavedChanges
        ? t("RoutineDetail.testTriggerSaveFirst")
        : t("RoutineDetail.testTriggerWarning");

  const testAction: AppModalActionProps = {
    id: "routines-run-now",
    label: t("RoutineDetail.testTrigger"),
    tooltip: testTooltip,
    icon: routineModalStore.isStartingRun ? RefreshCw : Play,
    busy: routineModalStore.isStartingRun,
    disabled:
      eventTriggered ||
      !routineModalStore.canManage ||
      !form.enabled ||
      routineModalStore.isLoading ||
      routineModalStore.hasUnsavedChanges,
    onClick: routineModalStore.runNow,
  };
  const duplicateAction: AppModalActionProps = {
    id: "routine-duplicate",
    label: t("Automations.canvas.duplicateAutomation"),
    icon: Copy,
    disabled: routineModalStore.isLoading,
    onClick: () => routineModalStore.duplicate(t("Automations.canvas.copyName", { name: (form.name ?? "").trim() })),
  };
  const deleteAction: AppModalActionProps = {
    id: "delete-routine",
    label: t("Common.actions.delete"),
    icon: Trash2,
    variant: "destructive",
    disabled: routineModalStore.isLoading,
    onClick: () =>
      showTrashConfirmation(
        () => routineModalStore.delete(),
        form.name ?? "",
        undefined,
        () => routineModalStore.rootStore.automationsStore.refresh(),
      ),
  };
  const canDuplicate = isExistingRoutine && routineModalStore.allows(Action.create);
  const actions: AppModalActions = !isExistingRoutine
    ? []
    : [
        ...(routineModalStore.canManage ? [testAction] : []),
        ...(canDuplicate ? [duplicateAction] : []),
        ...(routineModalStore.isAdmin ? [deleteAction] : []),
      ];
  const refreshPage = useCallback(() => {
    startRefreshTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (!isRefreshPending && routineRunChatStore.routeSyncStatus === "refreshing")
      routineRunChatStore.markRouteSyncComplete();
  }, [isRefreshPending, routineRunChatStore, routineRunChatStore.routeSyncStatus]);

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

  const steps = routineCanvasSteps({
    triggerKind: form.triggerKind ?? RoutineTriggerKind.schedule,
    cron: routineModalStore.compiledCron,
    timezone: form.timezone ?? "",
    triggerEvents: form.triggerEvents ?? [],
    prompt: form.prompt ?? "",
    run: openRun,
    invalid: {
      trigger: Boolean(routineModalStore.getError("cronExpression") || routineModalStore.getError("triggerEvents")),
      agent: Boolean(routineModalStore.getError("prompt")),
    },
    formatTime: (date) => intlStore.formatTime(date),
    t,
  });
  const selected = steps.find((step) => step.id === routineModalStore.selectedStep) ?? null;

  const canvasActions: AutomationCanvasActions = {
    selected: routineModalStore.selectedStep,
    paletteAt: null,
    palette: null,
    editable: false,
    onSelect: (id) => routineModalStore.selectStep(id === "trigger" || id === "agent" ? id : null),
    onOpenPalette: () => undefined,
    onPick: () => undefined,
  };

  const canPause = routineModalStore.canAdministerOtherRoutine && Boolean(form.enabled);
  const owner = form.owner ?? (isExistingRoutine ? null : routineModalStore.rootStore.userStore.user);
  const latestRunAt = routineModalStore.latestRunAt;

  const settings = <RoutineConfigurationPane store={routineModalStore} onPause={confirmPause} />;
  const panel = openRun ? (
    <div
      ref={runScrollRef}
      aria-label={t("RoutineDetail.runDetails")}
      className="min-h-0 flex-1 overflow-y-auto p-4"
      data-routine-layout="run"
      role="region"
    >
      <h2 className="sr-only" id="routine-run-detail-heading" tabIndex={-1}>
        {t("RoutineDetail.runDetails")}
      </h2>

      <RoutineRunDetail run={openRun} scrollContainerRef={runScrollRef} store={routineModalStore} />
    </div>
  ) : selected ? (
    <AutomationStepPanel
      readOnly={routineModalStore.isReadOnly}
      step={selected}
      onClose={() => routineModalStore.selectStep(null)}
    >
      {selected.id === "trigger" ? (
        <RoutineTriggerFields store={routineModalStore} />
      ) : (
        <RoutineAgentFields store={routineModalStore} />
      )}
    </AutomationStepPanel>
  ) : isExistingRoutine ? (
    <SegmentedControl
      className="flex min-w-0 flex-col gap-3 p-4"
      idPrefix="routine"
      items={[
        { value: "runs", label: t("RoutineDetail.runs") },
        { value: "details", label: t("Automations.canvas.settingsTab") },
      ]}
      label={t("RoutineModal.tabsLabel")}
      value={routineModalStore.activeTab}
      onValueChange={routineModalStore.setActiveTab}
    >
      <SegmentedControlPanel className="mt-0" value="runs">
        <RoutineRunsPane store={routineModalStore} />
      </SegmentedControlPanel>

      <SegmentedControlPanel className="mt-0" value="details">
        {settings}
      </SegmentedControlPanel>
    </SegmentedControl>
  ) : (
    <div className="p-4" data-routine-layout="create">
      {settings}
    </div>
  );

  return (
    <AgentChatStoreProvider store={routineRunChatStore} uiTargets={ROUTINE_RUN_CHAT_UI_TARGETS}>
      <AgentRouteReloadBridge reload={refreshPage} />

      <AutomationDrawerShell
        actions={actions}
        active={{
          checked: Boolean(form.enabled),
          disabled: routineModalStore.isLoading || (!routineModalStore.canManage && !canPause),
          onChange: (enabled) => {
            if (routineModalStore.canManage) routineModalStore.onChange("enabled", enabled);
            else if (!enabled && canPause) confirmPause();
          },
        }}
        banner={
          openRun ? (
            <AutomationReplayBanner
              when={intlStore.formatRelativeTime(openRun.createdAt)}
              onBack={routineModalStore.closeRun}
            />
          ) : undefined
        }
        canvas={<AutomationCanvas actions={canvasActions} steps={steps} />}
        footer={
          openRun ? undefined : (
            <UnsavedChangesBar
              anchorScope="routine-modal"
              creating={!isExistingRoutine}
              store={routineModalStore}
              onSave={routineModalStore.onSubmit}
            />
          )
        }
        idPrefix="routine"
        meta={{
          owner: owner
            ? {
                name: `${owner.firstName} ${owner.lastName}`.trim(),
                firstName: owner.firstName,
                lastName: owner.lastName,
                avatarUrl: owner.avatarUrl,
              }
            : null,
          runtime: { label: t("Automations.canvas.runtime.mate"), variant: "ink" },
          lastRun: latestRunAt
            ? t("AutomationRules.lastRun", { time: intlStore.formatRelativeTime(latestRunAt) })
            : t("AutomationRules.neverRun"),
        }}
        name={(form.name ?? "").trim() || t("RoutineModal.title")}
        panel={<AppForm store={routineModalStore}>{panel}</AppForm>}
        panelLabel={t("RoutineModal.tabsLabel")}
        sheetOpen={selected !== null}
        store={routineModalStore}
        title={t("RoutineModal.title")}
      />
    </AgentChatStoreProvider>
  );
});
