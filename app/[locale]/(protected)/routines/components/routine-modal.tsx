"use client";

import { ChevronLeft, Play, RefreshCw, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";

import type { AppModalActionProps, AppModalActions } from "@/components/modal";

import { RoutineTriggerKind } from "@/generated/prisma";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AgentChatStoreProvider } from "@/app/components/agent-chat/agent-chat-store-context";
import { AgentRouteReloadBridge } from "@/app/components/agent-chat/agent-route-reload";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { AppForm } from "@/components/forms/form-context";
import { AppModal } from "@/components/modal";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useIsWiderThan } from "@/hooks/use-media-query";
import { useRouter } from "@/i18n/navigation";

import { RoutineConfigurationPane } from "./routine-configuration-pane";
import { ROUTINE_RUN_CHAT_UI_TARGETS, RoutineRunDetail } from "./routine-run-detail";
import { RoutineRunsPane } from "./routine-runs-pane";

export const RoutineModal = observer(() => {
  const t = useTranslations();
  const router = useRouter();
  const { routineModalStore, routineRunChatStore } = useRootStore();
  const { form } = routineModalStore;
  const { showConfirmation, showDeleteConfirmation } = useDeleteConfirmation();
  const runScrollRef = useRef<HTMLDivElement>(null);
  const [isRefreshPending, startRefreshTransition] = useTransition();
  const wide = useIsWiderThan("lg");
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
  const deleteAction: AppModalActionProps = {
    id: "delete-routine",
    label: t("Common.actions.delete"),
    icon: Trash2,
    variant: "destructive",
    disabled: routineModalStore.isLoading,
    onClick: () => showDeleteConfirmation(() => routineModalStore.delete(), form.name),
  };
  const backAction: AppModalActionProps = {
    id: "routine-run-back",
    label: t("Common.actions.back"),
    icon: ChevronLeft,
    onClick: routineModalStore.closeRun,
  };
  const routineActions: AppModalActions = !isExistingRoutine
    ? []
    : routineModalStore.canManage
      ? routineModalStore.isAdmin
        ? [testAction, deleteAction]
        : [testAction]
      : routineModalStore.isAdmin
        ? [deleteAction]
        : [];
  const modalActions: AppModalActions = openRun ? [backAction] : routineActions;
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

  return (
    <AgentChatStoreProvider store={routineRunChatStore} uiTargets={ROUTINE_RUN_CHAT_UI_TARGETS}>
      <AgentRouteReloadBridge reload={refreshPage} />

      <AppModal
        actions={modalActions}
        description={(form.name ?? "").trim() || t("RoutineModal.title")}
        size={isExistingRoutine && wide ? "5xl" : "lg"}
        store={routineModalStore}
        title={t("RoutineModal.title")}
      >
        <AppForm store={routineModalStore}>
          <AppCard>
            <AppCardHeader>
              {openRun ? (
                <div className="min-w-0">
                  <h2 className="truncate text-x-lg outline-none" id="routine-run-detail-heading" tabIndex={-1}>
                    {t("RoutineDetail.runDetails")}
                  </h2>

                  <p className="truncate text-xs text-muted-foreground">
                    {(form.name ?? "").trim() || t("RoutineModal.title")}
                  </p>
                </div>
              ) : (
                <h2 className="truncate text-x-lg">{(form.name ?? "").trim() || t("RoutineModal.title")}</h2>
              )}
            </AppCardHeader>

            {openRun ? (
              <AppCardBody
                ref={runScrollRef}
                aria-label={t("RoutineDetail.runDetails")}
                data-routine-layout="run"
                role="region"
                tabIndex={0}
              >
                <RoutineRunDetail run={openRun} scrollContainerRef={runScrollRef} store={routineModalStore} />
              </AppCardBody>
            ) : isExistingRoutine && wide ? (
              <AppCardBody>
                <div
                  className="grid min-w-0 items-start gap-6 lg:min-h-[36rem] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]"
                  data-routine-layout="wide"
                >
                  <div className="min-w-0">
                    <RoutineConfigurationPane store={routineModalStore} onPause={confirmPause} />
                  </div>

                  <div className="min-w-0">
                    <RoutineRunsPane store={routineModalStore} />
                  </div>
                </div>
              </AppCardBody>
            ) : isExistingRoutine ? (
              <SegmentedControl
                className="flex min-h-0 flex-1 flex-col gap-0"
                idPrefix="routine"
                items={[
                  { value: "details", label: t("RoutineModal.detailsTab") },
                  { value: "runs", label: t("RoutineDetail.runs") },
                ]}
                label={t("RoutineModal.tabsLabel")}
                listClassName="mx-6 mt-4 w-auto"
                value={routineModalStore.activeTab}
                onValueChange={routineModalStore.setActiveTab}
              >
                <AppCardBody data-routine-layout="compact">
                  <SegmentedControlPanel className="mt-0" value="details">
                    <RoutineConfigurationPane store={routineModalStore} onPause={confirmPause} />
                  </SegmentedControlPanel>

                  <SegmentedControlPanel className="mt-0" value="runs">
                    <RoutineRunsPane store={routineModalStore} />
                  </SegmentedControlPanel>
                </AppCardBody>
              </SegmentedControl>
            ) : (
              <AppCardBody data-routine-layout="create">
                <RoutineConfigurationPane store={routineModalStore} onPause={confirmPause} />
              </AppCardBody>
            )}

            {!openRun && <FormFooterActions anchorScope="routine-modal" store={routineModalStore} />}
          </AppCard>
        </AppForm>
      </AppModal>
    </AgentChatStoreProvider>
  );
});
