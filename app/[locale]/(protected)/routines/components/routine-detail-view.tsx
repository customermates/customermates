"use client";

import type { RoutineDto, RoutineRunDto } from "@/ee/routines/routine.schema";
import type { RoutineRiskDto } from "@/ee/routines/get-routine-risks.interactor";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Pencil, Play } from "lucide-react";

import { Alert } from "@/components/shared/alert";
import { AppChip } from "@/components/chip/app-chip";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { ROUTINE_RUN_STATUS_CHIP_COLOR } from "@/ee/routines/routine-run-chip-colors";

import { routineFormFor } from "./routine-modal.store";
import { RoutineRunTranscript } from "./routine-run-transcript";
import { useRoutineDetailSync } from "./use-routine-detail-sync";

type Props = { routine: RoutineDto; initialRuns: RoutineRunDto[]; risks: RoutineRiskDto[] };

export const RoutineDetailView = observer(function RoutineDetailView({ routine, initialRuns, risks }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const { routineDetailStore, routineModalStore } = useRootStore();

  useRoutineDetailSync(routineDetailStore, routine, initialRuns);

  const runs = routineDetailStore.runs;
  const selectedRun = routineDetailStore.selectedRun;
  const nextRunLabel = `${t("RoutineDetail.nextRun")}: ${
    routine.nextRunAt ? intlStore.formatNumericalShortDateTime(routine.nextRunAt) : t("RoutineDetail.never")
  }`;

  return (
    <div className="flex flex-col gap-4">
      {risks.length > 0 && (
        <Alert color="warning">
          <p className="text-x-sm font-medium">{t("RoutineDetail.loopWarningTitle")}</p>

          <p className="text-x-sm">
            {risks.some((risk) => risk.kind === "selfLoop")
              ? t("RoutineDetail.loopWarningSelf")
              : t("RoutineDetail.loopWarningMutual")}
          </p>
        </Alert>
      )}

      <AppCard>
        <AppCardBody>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <h1 className="truncate text-x-lg font-medium">{routine.name}</h1>

              <div className="flex flex-wrap items-center gap-2">
                <AppChip size="sm" variant={routine.enabled ? "success" : "secondary"}>
                  {routine.enabled ? t("RoutineModal.enabled") : t("RoutineModal.disabled")}
                </AppChip>

                <AppChip size="sm">
                  {routine.triggerKind === "schedule"
                    ? (routine.cronExpression ?? t("RoutineTriggerKind.schedule"))
                    : t("RoutineTriggerKind.event")}
                </AppChip>

                <span className="text-subdued text-xs">{nextRunLabel}</span>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                disabled={routineDetailStore.isStartingRun}
                id="routines-run-now"
                size="sm"
                variant="secondary"
                onClick={() => runUserAction(() => routineDetailStore.runNow())}
              >
                <Play className="size-3.5" />

                {t("RoutineDetail.runNow")}
              </Button>

              <Button
                id="routines-edit"
                size="sm"
                variant="secondary"
                onClick={() => routineModalStore.openWith(routineFormFor(routine))}
              >
                <Pencil className="size-3.5" />

                {t("Common.actions.edit")}
              </Button>
            </div>
          </div>
        </AppCardBody>
      </AppCard>

      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <AppCard>
          <AppCardBody>
            <p className="text-subdued mb-2 text-xs font-medium">{t("RoutineDetail.runs")}</p>

            {runs.length === 0 ? (
              <p className="text-subdued text-sm">{t("RoutineDetail.noRuns")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {runs.map((run) => (
                  <li key={run.id}>
                    <button
                      className={cn(
                        "w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted",
                        run.id === routineDetailStore.selectedRunId && "bg-muted",
                      )}
                      type="button"
                      onClick={() => routineDetailStore.selectRun(run.id)}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm">{intlStore.formatNumericalShortDateTime(run.createdAt)}</span>

                        <AppChip size="sm" variant={ROUTINE_RUN_STATUS_CHIP_COLOR[run.status]}>
                          {t(`RoutineRunStatus.${run.status}`)}
                        </AppChip>
                      </span>

                      {(run.summary ?? run.error) && (
                        <span className="text-subdued mt-1 line-clamp-2 block text-xs">{run.summary ?? run.error}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </AppCardBody>
        </AppCard>

        <AppCard>
          <AppCardBody>
            {!selectedRun ? (
              <p className="text-subdued text-sm">{t("RoutineDetail.selectRun")}</p>
            ) : routineDetailStore.isTranscriptLoading ? (
              <Spinner aria-label={t("PageState.loading")} />
            ) : (
              <div className="space-y-3">
                <p className="text-subdued text-xs">{`${t("RoutineDetail.credits")}: ${selectedRun.chargedCredits}`}</p>

                <RoutineRunTranscript messages={routineDetailStore.transcript} />
              </div>
            )}
          </AppCardBody>
        </AppCard>
      </div>
    </div>
  );
});
