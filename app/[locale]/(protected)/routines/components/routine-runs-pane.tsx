"use client";

import type { RoutineRunDto } from "@/ee/routines/routine.schema";
import type { RoutineModalStore } from "./routine-modal.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CircleAlert, Loader2 } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { ROUTINE_RUN_STATUS_CHIP_COLOR } from "@/ee/routines/routine-run-chip-colors";
import { routineRunDetail, routineRunStopReason } from "@/ee/routines/routine-run-outcome";

import { RoutineEmptyState } from "./routine-empty-state";
import { RoutineRunDetail } from "./routine-run-detail";

function RoutineRunRow({ run, store }: { run: RoutineRunDto; store: RoutineModalStore }) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const transcriptRestricted = Boolean(run.conversationId) && !store.canOpenRun(run);
  const detail = routineRunDetail(run, t) || routineRunStopReason(run, t);
  const content = (
    <span className="flex w-full min-w-0 items-start gap-3">
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">
            {run.triggerEvent ? t(`Common.events.${run.triggerEvent}`) : t(`RoutineTriggerKind.${run.triggerKind}`)}
          </span>

          {run.chargedCredits > 0 && (
            <span className="text-subdued shrink-0 text-xs font-normal">
              {`${t("RoutineDetail.credits")}: ${run.chargedCredits}`}
            </span>
          )}
        </span>

        <span className="text-subdued mt-0.5 block text-xs font-normal">
          {t("RoutineDetail.ranAs", { owner: run.executedByName })}
        </span>

        {detail && (
          <MessageResponse className="text-subdued mt-0.5 line-clamp-2 text-xs font-normal">{detail}</MessageResponse>
        )}
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <time suppressHydrationWarning className="text-subdued text-xs font-normal whitespace-nowrap">
          {intlStore.formatRelativeTime(run.createdAt)}
        </time>

        <AppChip size="sm" variant={ROUTINE_RUN_STATUS_CHIP_COLOR[run.status]}>
          {t(`RoutineRunStatus.${run.status}`)}
        </AppChip>
      </span>
    </span>
  );

  return (
    <div className="group flex items-center gap-1 overflow-hidden rounded-lg border" role="listitem">
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
              {content}
            </span>
          </TooltipTrigger>

          <TooltipContent>
            {t("RoutineDetail.transcriptOwnerOnly", {
              owner: run.executedByName,
            })}
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button
          className="h-auto w-full min-w-0 flex-1 justify-start rounded-lg px-3 py-2.5 text-left"
          id={`routine-run-${run.id}`}
          type="button"
          variant="ghost"
          onClick={() => runUserAction(() => store.openRun(run))}
        >
          {content}
        </Button>
      )}
    </div>
  );
}

export const RoutineRunsPane = observer(({ store, wide }: { store: RoutineModalStore; wide: boolean }) => {
  const t = useTranslations();
  const openRun = store.openRun_;

  if (wide && openRun) return <RoutineRunDetail showBack run={openRun} store={store} />;

  return (
    <section aria-labelledby="routine-runs-heading" className="min-w-0">
      <div className="sticky top-0 z-10 border-b bg-background py-2.5">
        <h3 className="text-sm font-semibold outline-none" id="routine-runs-heading" tabIndex={-1}>
          {t("RoutineDetail.runs")}
        </h3>
      </div>

      {store.runsRequestState === "idle" || store.runsRequestState === "loading" ? (
        <div aria-busy="true" className="flex min-h-64 items-center justify-center" role="status">
          <Spinner aria-label={t("PageState.loading")} />
        </div>
      ) : store.runsRequestState === "error" ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
          <CircleAlert aria-hidden="true" className="size-8 text-destructive" />

          <div className="max-w-md space-y-1">
            <h4 className="text-sm font-medium">{t("RoutineDetail.runsLoadErrorTitle")}</h4>

            <p className="text-subdued text-sm">{t("RoutineDetail.runsLoadErrorDescription")}</p>
          </div>

          <Button size="sm" type="button" variant="secondary" onClick={() => runUserAction(store.retryLoadRuns)}>
            {t("ErrorCard.retry")}
          </Button>
        </div>
      ) : store.runs.length === 0 ? (
        <RoutineEmptyState store={store} />
      ) : (
        <>
          <div className="space-y-1 py-3" role="list">
            {store.runs.map((run) => (
              <RoutineRunRow key={run.id} run={run} store={store} />
            ))}
          </div>

          {store.runsNextCursor && (
            <Button
              className="mb-2 w-full"
              disabled={store.isLoadingMoreRuns}
              id="routine-runs-load-more"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => runUserAction(store.loadMoreRuns)}
            >
              {store.isLoadingMoreRuns && <Loader2 className="size-3.5 animate-spin" />}

              {t("Common.actions.loadMore")}
            </Button>
          )}
        </>
      )}
    </section>
  );
});
