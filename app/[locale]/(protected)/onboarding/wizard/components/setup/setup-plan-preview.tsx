"use client";

import type { WorkspaceSetupFailure } from "@/ee/workspace-setup/workspace-setup.schema";

import type { ReactNode } from "react";
import type { PlanStep } from "./setup-plan-progress";
import type { SetupTimelineRow } from "./setup-timeline";

import { BookOpen, Kanban, LayoutDashboard, List, Loader2, Mail, RotateCcw, Sparkles } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useBottomBarClearance } from "@/components/forms/unsaved-changes-bar";
import { Alert } from "@/components/shared/alert";
import { IconContainer } from "@/components/shared/icon-container";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { setupWidgetSketch } from "@/features/workspace-setup/setup-plan.schema";
import { supportMailHref } from "@/app/[locale]/(protected)/w/[workspace]/settings/(workspace)/components/subscription/support-mail-href";

import { planProgress } from "./setup-plan-progress";
import { planBoards, planCalendarSources, planLists } from "./setup-plan-summary";
import {
  DashboardSketch,
  KnowledgePageList,
  PipelineBoard,
  PreviewListChip,
  PreviewPanel,
} from "./setup-preview-parts";
import { SetupTimeline } from "./setup-timeline";

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

export function SetupActionBar({ hint, children }: { hint: string; children: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  useBottomBarClearance(bar);

  return (
    <div
      ref={bar}
      className="sticky bottom-[calc(0.625rem+var(--safe-bottom))] z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-popover p-2 ps-3 text-popover-foreground shadow-lg"
      data-slot="setup-action-bar"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />

        <span>{hint}</span>
      </span>

      <span className="flex items-center gap-2 max-sm:w-full max-sm:flex-wrap-reverse max-sm:[&_button]:flex-1">
        {children}
      </span>
    </div>
  );
}

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
  const labels: Record<PlanStep, { running: string; done: string }> = {
    answers: {
      running: t("WorkspaceSetup.plan.progress.steps.answers"),
      done: t("WorkspaceSetup.plan.progress.done.answers"),
    },
    model: {
      running: t("WorkspaceSetup.plan.progress.steps.model"),
      done: t("WorkspaceSetup.plan.progress.done.model"),
    },
    knowledge: {
      running: t("WorkspaceSetup.plan.progress.steps.knowledge"),
      done: t("WorkspaceSetup.plan.progress.done.knowledge"),
    },
    views: {
      running: t("WorkspaceSetup.plan.progress.steps.views"),
      done: t("WorkspaceSetup.plan.progress.done.views"),
    },
  };
  const rows: SetupTimelineRow[] = progress.steps
    .filter((step) => step.state !== "waiting")
    .map((step) =>
      step.state === "active"
        ? { key: step.key, status: "running", label: labels[step.key].running }
        : { key: step.key, status: "done", label: labels[step.key].done },
    );
  const active = progress.steps.findLast((step) => step.state === "active");
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

      <div className="flex flex-col gap-1">
        <SetupTimeline
          rows={rows}
          status="running"
          summary={active ? labels[active.key].running : t("WorkspaceSetup.plan.planningTitle")}
        />

        <p className="pl-5.5 text-xs text-muted-foreground">{remaining}</p>
      </div>
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
  const calendarSources = planCalendarSources(plan, lists);
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
                display: setupWidgetSketch(widget),
                size: "size" in widget ? widget.size : null,
              }))}
            />
          ) : (
            <p className="text-xs text-muted-foreground">{t("WorkspaceSetup.plan.noDashboard")}</p>
          )}

          {calendarSources.length ? (
            <p className="text-xs text-muted-foreground">
              {t("WorkspaceSetup.plan.calendarSources", { sources: calendarSources.join(" · ") })}
            </p>
          ) : null}
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

      <SetupActionBar hint={t("WorkspaceSetup.plan.reviewHint")}>
        <Button disabled={store.isBusy} type="button" variant="secondary" onClick={store.adjust}>
          {t("WorkspaceSetup.plan.adjust")}
        </Button>

        <Button disabled={store.isBusy} type="button" onClick={() => runUserAction(store.build)}>
          {store.pending === "build" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Sparkles />}

          {t("WorkspaceSetup.plan.build")}
        </Button>
      </SetupActionBar>
    </section>
  );
});
