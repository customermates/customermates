"use client";

import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";
import type { BuildPhaseState } from "./setup-build-state";

import { ArrowRight, Circle, CircleAlert, CircleCheck, CircleSlash, Loader2, RotateCcw } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { MateOrb } from "@/components/mate/mate-orb";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { buildOutcome, buildPhaseState, buildRecordCount, canRetryPhase } from "./setup-build-state";
import { SetupSupportButton, useSetupFailureMessage } from "./setup-plan-review";

function PhaseIcon({ state }: { state: BuildPhaseState }) {
  const className = "size-4 shrink-0";
  if (state === "done") return <CircleCheck aria-hidden="true" className={cn(className, "text-success")} />;
  const spinning = cn(className, "animate-spin text-primary motion-reduce:animate-none");
  if (state === "active") return <Loader2 aria-hidden="true" className={spinning} />;
  if (state === "failed") return <CircleAlert aria-hidden="true" className={cn(className, "text-destructive")} />;
  if (state === "skipped") return <CircleSlash aria-hidden="true" className={cn(className, "text-muted-foreground")} />;
  return <Circle aria-hidden="true" className={cn(className, "text-muted-foreground/50")} />;
}

export const SetupBuildView = observer(function SetupBuildView() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const failureMessage = useSetupFailureMessage();
  const [retrying, setRetrying] = useState<WorkspaceSetupPhase | null>(null);
  const setup = store.setup;
  if (!setup) return null;

  const outcome = buildOutcome(setup);
  const labels: Record<WorkspaceSetupPhase, string> = {
    dataModel: t("WorkspaceSetup.build.phases.dataModel"),
    views: t("WorkspaceSetup.build.phases.views"),
    records: t("WorkspaceSetup.build.phases.records"),
    dashboard: t("WorkspaceSetup.build.phases.dashboard"),
    knowledgeBase: t("WorkspaceSetup.build.phases.knowledgeBase"),
  };
  const summaries: Record<WorkspaceSetupPhase, string> = {
    knowledgeBase: t("WorkspaceSetup.build.summaries.knowledgeBase", {
      count: setup.results.pages.length || setup.knowledgeBase.pagesWritten,
    }),
    dataModel: t("WorkspaceSetup.build.summaries.dataModel", { count: setup.results.lists.length }),
    views: t("WorkspaceSetup.build.summaries.views", { count: setup.results.views.length }),
    records: t("WorkspaceSetup.build.summaries.records", { count: buildRecordCount(setup) }),
    dashboard: t("WorkspaceSetup.build.summaries.dashboard", { count: setup.results.widgets.length }),
  };
  const order: WorkspaceSetupPhase[] = ["dataModel", "views", "records", "dashboard", "knowledgeBase"];
  const phases = order.flatMap((key) => setup.phases.filter((phase) => phase.key === key));

  return (
    <section aria-busy={outcome === "running"} className="flex flex-col gap-4" id="setup-build">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MateOrb className="size-3.5" working={outcome === "running"} />

        {outcome === "completed"
          ? t("WorkspaceSetup.build.completedTitle")
          : outcome === "failed"
            ? t("WorkspaceSetup.build.failedTitle")
            : t("WorkspaceSetup.build.eyebrow")}
      </p>

      <ul aria-label={t("WorkspaceSetup.build.progressLabel")} className="flex flex-col gap-2.5">
        {phases.map((phase) => {
          const state = buildPhaseState(phase);
          return (
            <li key={phase.key} className="flex flex-col gap-1.5 text-sm" data-phase={phase.key} data-state={state}>
              <span className="flex items-center gap-2.5">
                <PhaseIcon state={state} />

                <span className={cn(state === "waiting" ? "text-muted-foreground" : "text-foreground")}>
                  {state === "done" ? summaries[phase.key] : labels[phase.key]}
                </span>
              </span>

              {state === "failed" ? (
                <span className="flex flex-col gap-2 pl-6.5 text-xs text-muted-foreground">
                  <span>{failureMessage(phase.error)}</span>

                  <span className="flex flex-wrap gap-2">
                    {canRetryPhase(phase) ? (
                      <Button
                        disabled={store.isBusy}
                        size="xs"
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setRetrying(phase.key);
                          runUserAction(() => store.retryPhase(phase.key));
                        }}
                      >
                        {store.pending === "retry" && retrying === phase.key ? (
                          <Loader2 className="animate-spin motion-reduce:animate-none" />
                        ) : (
                          <RotateCcw />
                        )}

                        {t("WorkspaceSetup.build.retry")}
                      </Button>
                    ) : null}

                    {phase.error === "spendCap" ? <SetupSupportButton size="xs" /> : null}
                  </span>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        {outcome === "completed"
          ? t("WorkspaceSetup.build.completedBody")
          : outcome === "failed"
            ? t("WorkspaceSetup.build.failedBody")
            : t("WorkspaceSetup.build.keepsRunning")}
      </p>
    </section>
  );
});

export const SetupBuildFooter = observer(function SetupBuildFooter() {
  const t = useTranslations();
  const { workspaceSetupStore: store, onboardingWizardStore: wizard } = useRootStore();

  return (
    <AppCardFooter className="justify-end">
      <Button
        className="min-h-11 max-sm:w-full"
        disabled={store.isBusy || wizard.isSubmitting}
        id="setup-build-continue"
        type="button"
        onClick={() => runUserAction(wizard.completeSetupStep)}
      >
        {wizard.isSubmitting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

        {t("OnboardingWizard.continue")}

        {wizard.isSubmitting ? null : <ArrowRight aria-hidden="true" className="size-4" />}
      </Button>
    </AppCardFooter>
  );
});
