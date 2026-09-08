"use client";

import type { RoutineRunDto } from "@/ee/routines/routine.schema";
import type { RoutineModalStore } from "./routine-modal.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { ChevronLeft } from "lucide-react";

import { RoutineRunStatus } from "@/generated/prisma";

import { AgentChatStoreProvider } from "@/app/components/agent-chat/agent-chat-store-context";
import { AgentConversationLog } from "@/app/components/agent-chat/agent-conversation";
import { Alert } from "@/components/shared/alert";
import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { ROUTINE_RUN_STATUS_CHIP_COLOR } from "@/ee/routines/routine-run-chip-colors";
import { routineRunDetail, routineRunStopReason } from "@/ee/routines/routine-run-outcome";

import { RoutineRunTriggerCard } from "./routine-run-trigger-card";

type Props = {
  run: RoutineRunDto;
  store: RoutineModalStore;
  showBack: boolean;
};

export const RoutineRunDetail = observer(({ run, store, showBack }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { routineRunChatStore } = useRootStore();
  const canOpenTranscript = Boolean(run.conversationId) && store.canOpenRun(run);
  const transcriptSelected = canOpenTranscript && routineRunChatStore.conversationId === run.conversationId;
  const transcriptFailed = canOpenTranscript && routineRunChatStore.conversationLoadError;
  const transcriptLoading =
    canOpenTranscript &&
    !transcriptFailed &&
    (routineRunChatStore.conversationLoadPendingId === run.conversationId || !transcriptSelected);
  const waitingCopy =
    run.status === RoutineRunStatus.queued
      ? t("RoutineDetail.runQueued")
      : run.status === RoutineRunStatus.running
        ? t("RoutineDetail.runStarting")
        : routineRunDetail(run, t);
  const stopReason = routineRunStopReason(run, t);

  return (
    <section aria-labelledby="routine-run-detail-heading" className="flex min-h-64 min-w-0 flex-col">
      <div className="sticky top-0 z-10 flex min-w-0 items-center gap-2 border-b bg-background py-2.5">
        {showBack && (
          <Button
            aria-label={t("Common.actions.back")}
            id="routine-run-pane-back"
            size="icon"
            type="button"
            variant="ghost"
            onClick={store.closeRun}
          >
            <ChevronLeft className="size-4" />
          </Button>
        )}

        <h3 className="truncate text-sm font-semibold outline-none" id="routine-run-detail-heading" tabIndex={-1}>
          {t("RoutineDetail.runDetails")}
        </h3>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b py-2.5">
        <span className="text-sm">{intlStore.formatNumericalShortDateTime(run.createdAt)}</span>

        <AppChip size="sm" variant={ROUTINE_RUN_STATUS_CHIP_COLOR[run.status]}>
          {t(`RoutineRunStatus.${run.status}`)}
        </AppChip>

        <span className="text-subdued text-xs">{t("RoutineDetail.ranAs", { owner: run.executedByName })}</span>

        <span className="text-subdued ml-auto text-xs">{`${t("RoutineDetail.credits")}: ${run.chargedCredits}`}</span>
      </div>

      {stopReason && <Alert className="my-3" color="warning" description={stopReason} />}

      <RoutineRunTriggerCard customColumns={store.customColumnsFor(run.triggerContext?.entityType ?? null)} run={run} />

      <AgentChatStoreProvider store={routineRunChatStore}>
        {transcriptLoading ? (
          <div className="flex min-h-48 flex-1 items-center justify-center" role="status">
            <Spinner aria-label={t("PageState.loading")} />
          </div>
        ) : transcriptFailed ? (
          <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
            <p className="text-subdued text-sm">{t("AgentChat.errors.turnFailed")}</p>

            <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(() => store.openRun(run))}>
              {t("ErrorCard.retry")}
            </Button>
          </div>
        ) : transcriptSelected ? (
          <div className="flex min-h-80 flex-1 flex-col">
            <AgentConversationLog readOnly scrollable={false} userLabel={t("RoutineDetail.instruction")} />
          </div>
        ) : (
          <div className="flex min-h-48 flex-1 items-center justify-center p-6">
            <p className="text-subdued text-center text-sm">
              {run.conversationId
                ? t("RoutineDetail.transcriptOwnerOnly", {
                    owner: run.executedByName,
                  })
                : waitingCopy || t("RoutineDetail.runNoTranscript")}
            </p>
          </div>
        )}
      </AgentChatStoreProvider>
    </section>
  );
});
