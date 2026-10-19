"use client";

import type { WorkspaceSetupFailure } from "@/ee/workspace-setup/workspace-setup.schema";

import type { LucideIcon } from "lucide-react";
import type { PlanStep, PlanStepState } from "./setup-plan-progress";

import {
  BookOpen,
  Check,
  Circle,
  Kanban,
  LayoutDashboard,
  List,
  Loader2,
  Mail,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { IconContainer } from "@/components/shared/icon-container";
import { WizardProgress } from "@/components/shared/wizard-progress";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { supportMailHref } from "@/app/[locale]/(protected)/settings/(workspace)/components/subscription/support-mail-href";

import { planProgress } from "./setup-plan-progress";
import { planBoards, planLists } from "./setup-plan-summary";
import {
  DashboardSketch,
  KnowledgePageList,
  PipelineBoard,
  PreviewListChip,
  PreviewPanel,
} from "./setup-preview-parts";

export function useSetupFailureMessage() {
  const t = useTranslations();
  const messages: Record<WorkspaceSetupFailure, string> = {
    spendCap: t("WorkspaceSetup.failures.spendCap"),
    aiUnavailable: t("WorkspaceSetup.failures.aiUnavailable"),
    generation: t("WorkspaceSetup.failures.generation"),
    invalidPlan: t("WorkspaceSetup.failures.invalidPlan"),
    schemaChanged: t("WorkspaceSetup.failures.schemaChanged"),
    permission: t("WorkspaceSetup.failures.permission"),
    crawlFailed: t("WorkspaceSetup.failures.crawlFailed"),
    spreadsheet: t("WorkspaceSetup.failures.spreadsheet"),
    dependency: t("WorkspaceSetup.failures.dependency"),
    error: t("WorkspaceSetup.failures.error"),
  };
  return (failure: WorkspaceSetupFailure | null) => messages[failure ?? "error"];
}

export function SetupSupportButton({ size }: { size?: "xs" }) {
  const t = useTranslations();
  return (
    <Button
      className={size ? "self-start" : undefined}
      size={size}
      type="button"
      variant="secondary"
      onClick={() => {
        const href = supportMailHref(t("WorkspaceSetup.failures.supportSubject"));
        if (href) window.location.assign(href);
      }}
    >
      <Mail />

      {t("WorkspaceSetup.failures.contactSupport")}
    </Button>
  );
}

const PLAN_STEP_ICONS: Record<PlanStepState, LucideIcon> = { done: Check, active: Loader2, waiting: Circle };

function usePlanClock() {
  const [seenAt] = useState(() => Date.now());
  const [now, setNow] = useState(seenAt);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return { now, seenAt };
}

export const SetupPlanPending = observer(function SetupPlanPending() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const { now, seenAt } = usePlanClock();
  const setup = store.setup;
  if (!setup) return null;
  const progress = planProgress(setup, now, seenAt);
  const labels: Record<PlanStep, string> = {
    answers: t("WorkspaceSetup.plan.progress.steps.answers"),
    model: t("WorkspaceSetup.plan.progress.steps.model"),
    knowledge: t("WorkspaceSetup.plan.progress.steps.knowledge"),
    views: t("WorkspaceSetup.plan.progress.steps.views"),
  };
  const states: Record<PlanStepState, string> = {
    done: t("WorkspaceSetup.build.states.done"),
    active: t("WorkspaceSetup.build.states.active"),
    waiting: t("WorkspaceSetup.build.states.waiting"),
  };
  const remaining = progress.overdue
    ? t("WorkspaceSetup.plan.progress.overdue")
    : progress.remainingMs > 60_000
      ? t("WorkspaceSetup.plan.progress.minutesLeft", { minutes: Math.round(progress.remainingMs / 60_000) })
      : t("WorkspaceSetup.plan.progress.underMinute");

  return (
    <section className="flex animate-page-empty-in flex-col gap-6 py-4 motion-reduce:animate-none">
      <div className="flex items-start gap-4">
        <IconContainer icon={Sparkles} size="md" />

        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-base font-medium text-foreground">{t("WorkspaceSetup.plan.planningTitle")}</h2>

          <p className="text-sm leading-relaxed text-muted-foreground">{t("WorkspaceSetup.plan.progress.typical")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <WizardProgress
          current={progress.percent}
          label={t("WorkspaceSetup.plan.progress.label")}
          total={100}
          valueText={remaining}
        />

        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span aria-live="polite" role="status">
            {remaining}
          </span>

          <span aria-hidden className="tabular-nums">
            {progress.percent} %
          </span>
        </div>
      </div>

      <ol aria-label={t("WorkspaceSetup.plan.progress.stepsLabel")} className="flex flex-col gap-3">
        {progress.steps.map((step) => {
          const Icon = PLAN_STEP_ICONS[step.state];
          return (
            <li
              key={step.key}
              aria-current={step.state === "active" ? "step" : undefined}
              className="flex items-center gap-3"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  step.state === "done" && "bg-primary text-primary-foreground",
                  step.state === "active" && "bg-primary/10 text-primary",
                  step.state === "waiting" && "border border-border text-muted-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-3.5",
                    step.state === "active" && "animate-spin motion-reduce:animate-none",
                    step.state === "waiting" && "size-2",
                  )}
                />
              </span>

              <span
                className={cn(
                  "min-w-0 flex-1 text-sm",
                  step.state === "waiting" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {labels[step.key]}
              </span>

              <span className="sr-only">{states[step.state]}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
});

type PlanFailedProps = { onContinue: () => Promise<void>; continuing: boolean };

export const SetupPlanFailed = observer(function SetupPlanFailed({ onContinue, continuing }: PlanFailedProps) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const failureMessage = useSetupFailureMessage();
  const error = store.setup?.plan.error ?? null;
  return (
    <section className="flex flex-col gap-5">
      <Alert color="danger" description={failureMessage(error)} title={t("WorkspaceSetup.plan.failedTitle")} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {error === "spendCap" ? (
          <>
            <Button
              disabled={store.isBusy || continuing}
              type="button"
              variant="secondary"
              onClick={() => runUserAction(onContinue)}
            >
              {continuing ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

              {t("WorkspaceSetup.actions.continueAnyway")}
            </Button>

            <SetupSupportButton />
          </>
        ) : (
          <>
            <Button disabled={store.isBusy} type="button" variant="secondary" onClick={store.adjust}>
              {t("WorkspaceSetup.plan.adjust")}
            </Button>

            <Button disabled={store.isBusy} type="button" onClick={() => runUserAction(store.replan)}>
              {store.pending === "plan" ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" />
              ) : (
                <RotateCcw />
              )}

              {t("WorkspaceSetup.plan.tryAgain")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
});

export const SetupPlanPreview = observer(function SetupPlanPreview() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const plan = store.setup?.plan.plan;
  if (!plan) return <SetupPlanPending />;
  const lists = planLists(plan);
  const boards = planBoards(plan);
  const listName = (key: string) => lists.find((candidate) => candidate.key === key)?.label ?? key;
  const withFields = lists.filter((list) => list.fields.length > 0);
  const sampleTotal = lists.reduce((total, list) => total + list.sampleCount, 0);
  const spreadsheet = store.setup?.spreadsheet;

  return (
    <section className="flex animate-page-result-in flex-col gap-5 motion-reduce:animate-none">
      <div className="grid gap-4 lg:grid-cols-2">
        <PreviewPanel icon={List} title={t("WorkspaceSetup.plan.lists")}>
          <div className="flex flex-wrap gap-1.5">
            {lists.map((list) => (
              <PreviewListChip key={list.key} color={list.color} icon={list.icon} label={list.label} />
            ))}
          </div>

          {withFields.length ? (
            <dl className="grid gap-2 text-xs">
              {withFields.map((list) => (
                <div key={list.key} className="grid gap-0.5">
                  <dt className="font-medium">{t("WorkspaceSetup.plan.keyFields", { list: listName(list.key) })}</dt>

                  <dd className="text-muted-foreground">
                    {list.fields
                      .slice(0, 6)
                      .map((field) => field.label)
                      .join(" · ")}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </PreviewPanel>

        <PreviewPanel icon={Kanban} title={t("WorkspaceSetup.plan.pipeline")}>
          {boards.length ? (
            boards.slice(0, 2).map((board) => (
              <div key={board.field} className="grid gap-2">
                <p className="text-xs font-medium">{listName(board.list)}</p>

                <PipelineBoard stages={board.stages} />
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">{t("WorkspaceSetup.plan.noPipeline")}</p>
          )}
        </PreviewPanel>

        <PreviewPanel icon={LayoutDashboard} title={t("WorkspaceSetup.plan.dashboard")}>
          {plan.dashboard.widgets.length ? (
            <DashboardSketch
              tiles={plan.dashboard.widgets.map((widget) => ({
                key: widget.key,
                title: widget.title,
                display: widget.display,
                size: widget.size,
              }))}
            />
          ) : (
            <p className="text-xs text-muted-foreground">{t("WorkspaceSetup.plan.noDashboard")}</p>
          )}
        </PreviewPanel>

        <PreviewPanel icon={BookOpen} title={t("WorkspaceSetup.plan.knowledgeBase")}>
          {plan.knowledgeBase.pages.length ? (
            <KnowledgePageList titles={plan.knowledgeBase.pages.map((page) => page.title)} />
          ) : (
            <p className="text-xs text-muted-foreground">{t("WorkspaceSetup.plan.noPages")}</p>
          )}
        </PreviewPanel>
      </div>

      {plan.importMapping && spreadsheet ? (
        <p className="text-sm text-muted-foreground">
          {t("WorkspaceSetup.plan.importSummary", {
            fileName: spreadsheet.fileName,
            list: listName(plan.importMapping.list),
          })}
        </p>
      ) : sampleTotal > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("WorkspaceSetup.plan.sampleSummary", { count: sampleTotal })}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button disabled={store.isBusy} type="button" variant="secondary" onClick={store.adjust}>
          {t("WorkspaceSetup.plan.adjust")}
        </Button>

        <Button disabled={store.isBusy} type="button" onClick={() => runUserAction(store.build)}>
          {store.pending === "build" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Sparkles />}

          {t("WorkspaceSetup.plan.build")}
        </Button>
      </div>
    </section>
  );
});
