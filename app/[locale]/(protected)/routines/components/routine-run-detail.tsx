"use client";

import type { RoutineRunDto } from "@/ee/routines/routine.schema";
import type { RoutineModalStore } from "./routine-modal.store";
import type { RefObject } from "react";

import { observer } from "mobx-react-lite";
import { useRef } from "react";
import { useTranslations } from "next-intl";

import { RoutineRunStatus } from "@/generated/prisma";

import type { AgentChatUiTargets } from "@/app/components/agent-chat/agent-chat-store-context";

import { AgentComposer, AgentConversationLog } from "@/app/components/agent-chat/agent-conversation";
import { AgentProgressStatus, AgentStatusAnnouncer } from "@/app/components/agent-chat/agent-status-announcer";
import { useAgentChatConfig } from "@/app/components/agent-chat/use-agent-chat-config";
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
  scrollContainerRef: RefObject<HTMLElement | null>;
  store: RoutineModalStore;
};

export const ROUTINE_RUN_CHAT_UI_TARGETS = {
  composerId: "routine-run-agent-composer",
  fallbackFocusId: "routine-run-detail-heading",
  usageId: "routine-run-agent-usage",
} satisfies AgentChatUiTargets;

export const RoutineRunDetail = observer(({ run, scrollContainerRef, store }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { routineRunChatStore } = useRootStore();
  const composerContainerRef = useRef<HTMLDivElement>(null);
  const canOpenTranscript = Boolean(run.conversationId) && store.canOpenRun(run);
  const continuationEligible =
    canOpenTranscript && run.status !== RoutineRunStatus.queued && run.status !== RoutineRunStatus.running;
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
  useAgentChatConfig(routineRunChatStore, transcriptSelected);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{intlStore.formatNumericalShortDateTime(run.createdAt)}</span>

        <AppChip size="sm" variant={ROUTINE_RUN_STATUS_CHIP_COLOR[run.status]}>
          {t(`RoutineRunStatus.${run.status}`)}
        </AppChip>

        <span className="text-subdued text-xs">{t("RoutineDetail.ranAs", { owner: run.executedByName })}</span>

        <span className="text-subdued ml-auto text-xs">{`${t("RoutineDetail.credits")}: ${run.chargedCredits}`}</span>
      </div>

      {stopReason && <Alert color="warning" description={stopReason} />}

      <RoutineRunTriggerCard customColumns={store.customColumnsFor(run.triggerContext?.entityType ?? null)} run={run} />

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
        <div className="flex flex-1 flex-col">
          <AgentConversationLog
            readOnly={!continuationEligible || routineRunChatStore.enabled !== true}
            scrollContainerRef={scrollContainerRef}
            scrollFooterRef={composerContainerRef}
          />

          {continuationEligible && routineRunChatStore.enabled === true && <AgentProgressStatus />}

          <div
            ref={composerContainerRef}
            className={
              continuationEligible && routineRunChatStore.enabled === true
                ? "sticky bottom-0 z-10 bg-background"
                : undefined
            }
          >
            {continuationEligible && routineRunChatStore.enabled === true ? (
              <AgentComposer />
            ) : continuationEligible && routineRunChatStore.enabled === null ? (
              <div className="flex items-center justify-center py-4" role="status">
                <Spinner aria-label={t("PageState.loading")} />
              </div>
            ) : continuationEligible && routineRunChatStore.enabled === false ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t("AgentChat.credits.blocked.configuration_unavailable")}
              </p>
            ) : null}
          </div>

          <AgentStatusAnnouncer />
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
    </div>
  );
});
