"use client";

import { ChevronLeft, Play, RefreshCw, Trash2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { AppModalActionProps, AppModalActions } from "@/components/modal";

import { RoutineTriggerKind } from "@/generated/prisma";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { FormActions } from "@/components/card/form-actions";
import { AppForm } from "@/components/forms/form-context";
import { AppModal } from "@/components/modal";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useIsWiderThan } from "@/hooks/use-media-query";

import { RoutineConfigurationPane } from "./routine-configuration-pane";
import { RoutineRunDetail } from "./routine-run-detail";
import { RoutineRunsPane } from "./routine-runs-pane";

export const RoutineModal = observer(() => {
  const t = useTranslations();
  const { routineModalStore } = useRootStore();
  const { form } = routineModalStore;
  const { showConfirmation, showDeleteConfirmation } = useDeleteConfirmation();
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
  const routineActions: AppModalActions = !isExistingRoutine
    ? []
    : routineModalStore.isOwner
      ? routineModalStore.isAdmin
        ? [testAction, deleteAction]
        : [testAction]
      : routineModalStore.isAdmin
        ? [deleteAction]
        : [];
  const modalActions: AppModalActions =
    openRun && !wide
      ? [
          {
            id: "routine-run-back",
            label: t("Common.actions.back"),
            icon: ChevronLeft,
            onClick: routineModalStore.closeRun,
          },
        ]
      : routineActions;

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
    <AppModal
      actions={modalActions}
      size={isExistingRoutine && wide ? "5xl" : "lg"}
      store={routineModalStore}
      title={t("RoutineModal.title")}
    >
      <AppForm store={routineModalStore}>
        <AppCard>
          <AppCardHeader>
            <h2 className="truncate text-x-lg">{(form.name ?? "").trim() || t("RoutineModal.title")}</h2>
          </AppCardHeader>

          {isExistingRoutine && wide ? (
            <AppCardBody className="p-0">
              <div
                className="grid min-w-0 items-start lg:min-h-[36rem] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]"
                data-routine-layout="wide"
              >
                <div className="min-w-0 p-6">
                  <RoutineConfigurationPane store={routineModalStore} onPause={confirmPause} />
                </div>

                <div className="min-w-0 border-l p-6">
                  <RoutineRunsPane wide store={routineModalStore} />
                </div>
              </div>
            </AppCardBody>
          ) : openRun ? (
            <AppCardBody className="gap-0 py-0" data-routine-layout="compact-run">
              <RoutineRunDetail run={openRun} showBack={false} store={routineModalStore} />
            </AppCardBody>
          ) : isExistingRoutine ? (
            <Tabs
              className="flex min-h-0 flex-1 flex-col gap-0"
              value={routineModalStore.activeTab}
              onValueChange={(value) => routineModalStore.setActiveTab(value as "details" | "runs")}
            >
              <div className="px-6 pt-4">
                <TabsList aria-label={t("RoutineModal.tabsLabel")} variant="segmented">
                  <TabsTrigger id="routine-tab-details" value="details">
                    {t("RoutineModal.detailsTab")}
                  </TabsTrigger>

                  <TabsTrigger id="routine-tab-runs" value="runs">
                    {t("RoutineDetail.runs")}
                  </TabsTrigger>
                </TabsList>
              </div>

              <AppCardBody data-routine-layout="compact">
                <TabsContent className="mt-0" value="details">
                  <RoutineConfigurationPane store={routineModalStore} onPause={confirmPause} />
                </TabsContent>

                <TabsContent className="mt-0" value="runs">
                  <RoutineRunsPane store={routineModalStore} wide={false} />
                </TabsContent>
              </AppCardBody>
            </Tabs>
          ) : (
            <AppCardBody data-routine-layout="create">
              <RoutineConfigurationPane store={routineModalStore} onPause={confirmPause} />
            </AppCardBody>
          )}

          {(!openRun || wide) && <FormActions showInitially anchorScope="routine-modal" store={routineModalStore} />}
        </AppCard>
      </AppForm>
    </AppModal>
  );
});
