"use client";

import type { LucideIcon } from "lucide-react";
import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";
import type { WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";
import type { BuildPhaseState } from "./setup-build-state";
import type { SetupPreviewList } from "./setup-plan-summary";

import {
  BookOpen,
  Check,
  Circle,
  FileText,
  Kanban,
  LayoutDashboard,
  Loader2,
  Minus,
  RotateCcw,
  Rows3,
  X,
} from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { useRouter } from "@/i18n/navigation";

import {
  buildBoard,
  buildLists,
  buildOutcome,
  buildPhaseState,
  buildTable,
  canRetryPhase,
  phaseActive,
  phaseDone,
} from "./setup-build-state";
import { planBoards } from "./setup-plan-summary";
import { SetupSupportButton, useSetupFailureMessage } from "./setup-plan-preview";
import {
  DashboardSketch,
  KnowledgePageList,
  PipelineBoard,
  PlaceholderLine,
  PreviewListChip,
} from "./setup-preview-parts";

const PHASE_ICONS: Record<BuildPhaseState, LucideIcon> = {
  waiting: Circle,
  active: Loader2,
  done: Check,
  failed: X,
  skipped: Minus,
};

function PhaseIcon({ state }: { state: BuildPhaseState }) {
  const Icon = PHASE_ICONS[state];
  return (
    <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          state === "active" && "animate-spin motion-reduce:animate-none",
          state === "failed" && "text-destructive",
          (state === "waiting" || state === "skipped") && "text-muted-foreground",
        )}
      />
    </span>
  );
}

function listLabel(list: SetupPreviewList) {
  return list.label ?? list.key;
}

const SetupAppFrame = observer(function SetupAppFrame({ setup }: { setup: WorkspaceSetupView }) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const lists = buildLists(setup);
  const board = buildBoard(setup);
  const table = buildTable(setup, board?.list.key ?? null);
  const plan = setup.plan.plan;
  const planStages = plan ? planBoards(plan) : [];
  const boardColors = planStages.find((candidate) => candidate.list === board?.list.key)?.stages ?? [];
  const modelReady = phaseDone(setup, "dataModel");
  const companyName = store.answers.companyName?.value;
  const widgets = setup.results.widgets;
  const plannedWidgets = plan?.dashboard.widgets.length ?? 0;
  const pages = setup.results.pages;
  const plannedPages = Math.max(plan?.knowledgeBase.pages.length ?? 0, setup.knowledgeBase.pagesPlanned);

  return (
    <div
      aria-label={t("WorkspaceSetup.build.previewLabel")}
      className="min-w-0 overflow-hidden rounded-xl border border-border bg-sidebar shadow-xl shadow-primary/5"
      role="group"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="min-w-0 text-xs font-medium [overflow-wrap:anywhere]">
          {companyName?.format === "shortText" && companyName.value
            ? companyName.value
            : t("WorkspaceSetup.build.frameTitle")}
        </span>
      </div>

      <div className="flex min-h-[26rem]">
        <nav
          aria-label={t("WorkspaceSetup.build.sidebarLabel")}
          className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-border p-2 text-xs sm:flex"
        >
          <span className="flex items-center gap-2 rounded-md bg-selected px-2 py-1.5 font-medium">
            <LayoutDashboard aria-hidden className="size-3.5" />

            {t("WorkspaceSetup.plan.dashboard")}
          </span>

          <span className="px-2 pt-3 pb-1 text-muted-foreground">{t("WorkspaceSetup.plan.lists")}</span>

          {lists.map((list) =>
            list.ready || modelReady ? (
              <span
                key={list.key}
                className="flex animate-page-result-in items-center gap-2 rounded-md px-2 py-1.5 motion-reduce:animate-none"
              >
                <RecordTypeGlyph className="size-3.5" icon={list.icon} />

                <span className="truncate">{listLabel(list)}</span>
              </span>
            ) : (
              <span key={list.key} className="flex items-center gap-2 p-2">
                <PlaceholderLine className="size-3.5 rounded-sm" pulse={phaseActive(setup, "dataModel")} />

                <PlaceholderLine className="w-20" pulse={phaseActive(setup, "dataModel")} />
              </span>
            ),
          )}

          <span className="mt-3 flex items-center gap-2 rounded-md px-2 py-1.5">
            <BookOpen aria-hidden className="size-3.5" />

            {t("WorkspaceSetup.plan.knowledgeBase")}
          </span>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-3 bg-background p-3">
          {board ? (
            <FramePanel icon={Kanban} title={listLabel(board.list)}>
              <PipelineBoard
                pulse={phaseActive(setup, "dataModel")}
                records={board.records}
                stages={board.list.stages.map((label) => ({
                  label,
                  color: boardColors.find((stage) => stage.label === label)?.color ?? null,
                }))}
              />
            </FramePanel>
          ) : null}

          <FramePanel icon={Rows3} title={table ? listLabel(table.list) : t("WorkspaceSetup.build.records")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("WorkspaceSetup.build.nameColumn")}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {table
                  ? table.titles.slice(0, 5).map((title) => (
                      <TableRow key={title} className="animate-page-result-in motion-reduce:animate-none">
                        <TableCell className="whitespace-normal [overflow-wrap:anywhere]">{title}</TableCell>
                      </TableRow>
                    ))
                  : [0, 1, 2].map((row) => (
                      <TableRow key={row}>
                        <TableCell>
                          <PlaceholderLine
                            className={row === 1 ? "w-1/2" : "w-2/3"}
                            pulse={phaseActive(setup, "records")}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </FramePanel>

          <FramePanel icon={LayoutDashboard} title={t("WorkspaceSetup.plan.dashboard")}>
            {widgets.length ? (
              <DashboardSketch
                tiles={widgets.map((widget) => ({ key: widget.id, title: widget.title, display: widget.display }))}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: Math.min(Math.max(plannedWidgets, 2), 4) }, (_, tile) => (
                  <div
                    key={tile}
                    className="flex min-h-28 flex-col justify-end gap-2 rounded-lg border border-border p-3"
                  >
                    <PlaceholderLine className="w-2/3" pulse={phaseActive(setup, "dashboard")} />

                    <PlaceholderLine className="w-1/3" pulse={phaseActive(setup, "dashboard")} />
                  </div>
                ))}
              </div>
            )}
          </FramePanel>

          <FramePanel icon={BookOpen} title={t("WorkspaceSetup.plan.knowledgeBase")}>
            {pages.length ? (
              <KnowledgePageList titles={pages.map((page) => page.title)} />
            ) : (
              <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
                {Array.from({ length: Math.min(Math.max(plannedPages, 2), 6) }, (_, row) => (
                  <div key={row} className="flex items-center gap-2">
                    <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />

                    <PlaceholderLine className="w-3/4" pulse={phaseActive(setup, "knowledgeBase")} />
                  </div>
                ))}
              </div>
            )}
          </FramePanel>

          {lists.some((list) => list.color) && modelReady ? (
            <div className="flex flex-wrap gap-1.5">
              {lists
                .filter((list) => list.color)
                .map((list) => (
                  <PreviewListChip key={list.key} color={list.color} icon={list.icon} label={listLabel(list)} />
                ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
});

function FramePanel({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <Card aria-label={title} className="min-w-0 gap-2 py-3" role="region">
      <CardContent className="flex min-w-0 flex-col gap-2 px-3">
        <h3 className="flex items-center gap-1.5 text-xs font-medium">
          <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />

          <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
        </h3>

        {children}
      </CardContent>
    </Card>
  );
}

type Props = { onContinue: () => Promise<void> };

export const SetupBuildView = observer(function SetupBuildView({ onContinue }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const { workspaceSetupStore: store, navigationGuard } = useRootStore();
  const failureMessage = useSetupFailureMessage();
  const heading = useRef<HTMLHeadingElement>(null);
  const setup = store.setup;
  const outcome = setup ? buildOutcome(setup) : "running";

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    if (outcome === "running") return;
    navigationGuard.requestRouteRefreshWhenSafe(() => router.refresh());
  }, [navigationGuard, outcome, router]);

  if (!setup) return null;

  const phaseLabels: Record<WorkspaceSetupPhase, string> = {
    knowledgeBase: t("WorkspaceSetup.build.phases.knowledgeBase"),
    dataModel: t("WorkspaceSetup.build.phases.dataModel"),
    views: t("WorkspaceSetup.build.phases.views"),
    records: t("WorkspaceSetup.build.phases.records"),
    dashboard: t("WorkspaceSetup.build.phases.dashboard"),
  };
  const stateLabels: Record<BuildPhaseState, string> = {
    waiting: t("WorkspaceSetup.build.states.waiting"),
    active: t("WorkspaceSetup.build.states.active"),
    done: t("WorkspaceSetup.build.states.done"),
    failed: t("WorkspaceSetup.build.states.failed"),
    skipped: t("WorkspaceSetup.build.states.skipped"),
  };
  const board = buildBoard(setup);
  const recordCount = setup.results.records.reduce((total, entry) => total + entry.count, 0);
  const imported = setup.results.records.some((entry) => entry.kind === "imported") || Boolean(setup.spreadsheet);
  const summaries: Record<WorkspaceSetupPhase, string> = {
    knowledgeBase: t("WorkspaceSetup.build.summaries.knowledgeBase", {
      count: setup.results.pages.length || setup.knowledgeBase.pagesWritten,
    }),
    dataModel: t("WorkspaceSetup.build.summaries.dataModel", { count: setup.results.lists.length }),
    views: t("WorkspaceSetup.build.summaries.views", { count: setup.results.views.length }),
    records: t("WorkspaceSetup.build.summaries.records", { count: recordCount }),
    dashboard: t("WorkspaceSetup.build.summaries.dashboard", { count: setup.results.widgets.length }),
  };
  const readingWebsite = setup.knowledgeBase.pagesPlanned === 0 && Boolean(setup.websiteUrl);
  const actions: Record<WorkspaceSetupPhase, string> = {
    knowledgeBase: readingWebsite
      ? t("WorkspaceSetup.build.actions.readingWebsite", { website: setup.websiteUrl ?? "" })
      : t("WorkspaceSetup.build.actions.knowledgeBase", {
          written: setup.knowledgeBase.pagesWritten,
          planned: setup.knowledgeBase.pagesPlanned,
        }),
    dataModel:
      board && board.list.stages.length
        ? t("WorkspaceSetup.build.actions.pipeline", {
            list: listLabel(board.list),
            stages: board.list.stages.join(" → "),
          })
        : t("WorkspaceSetup.build.actions.dataModel"),
    views: t("WorkspaceSetup.build.actions.views"),
    records: imported
      ? t("WorkspaceSetup.build.actions.importing", { fileName: setup.spreadsheet?.fileName ?? "" })
      : t("WorkspaceSetup.build.actions.records"),
    dashboard: t("WorkspaceSetup.build.actions.dashboard"),
  };
  const status =
    outcome === "completed"
      ? t("WorkspaceSetup.build.completedBody")
      : outcome === "failed"
        ? t("WorkspaceSetup.build.failedBody")
        : setup.currentPhase
          ? actions[setup.currentPhase]
          : t("WorkspaceSetup.build.actions.preparing");

  return (
    <section aria-busy={outcome === "running"} className="flex w-full max-w-6xl flex-col gap-6 py-2">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 ref={heading} className="text-2xl font-semibold outline-none" tabIndex={-1}>
            {outcome === "completed"
              ? t("WorkspaceSetup.build.completedTitle")
              : outcome === "failed"
                ? t("WorkspaceSetup.build.failedTitle")
                : t("WorkspaceSetup.build.title")}
          </h1>

          <p aria-live="polite" className="flex items-start gap-2 text-sm text-muted-foreground" role="status">
            {outcome === "running" ? (
              <Loader2 aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />
            ) : null}

            <span className="[overflow-wrap:anywhere]">{status}</span>
          </p>

          {outcome === "running" ? (
            <p className="text-xs text-muted-foreground">{t("WorkspaceSetup.build.keepsRunning")}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
          {outcome === "completed" ? (
            <Button disabled={store.isBusy} type="button" onClick={() => runUserAction(onContinue)}>
              {t("WorkspaceSetup.build.continue")}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <ol aria-label={t("WorkspaceSetup.build.phasesLabel")} className="flex flex-col gap-2">
          {setup.phases.map((phase) => {
            const state = buildPhaseState(phase);
            return (
              <li
                key={phase.key}
                aria-current={state === "active" ? "step" : undefined}
                className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <PhaseIcon state={state} />

                  <span className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">
                    {phaseLabels[phase.key]}
                  </span>

                  <span className="shrink-0 text-xs text-muted-foreground">{stateLabels[state]}</span>
                </div>

                {state === "active" ? (
                  <p className="pl-7 text-xs text-muted-foreground [overflow-wrap:anywhere]">{actions[phase.key]}</p>
                ) : null}

                {state === "done" ? <p className="pl-7 text-xs text-muted-foreground">{summaries[phase.key]}</p> : null}

                {state === "failed" ? (
                  <div className="flex flex-col gap-2 pl-7">
                    <p className="text-xs text-destructive">{failureMessage(phase.error)}</p>

                    <div className="flex flex-wrap gap-2">
                      {canRetryPhase(phase) ? (
                        <Button
                          disabled={store.isBusy}
                          size="xs"
                          type="button"
                          variant="secondary"
                          onClick={() => runUserAction(() => store.retryPhase(phase.key))}
                        >
                          {store.pending === "retry" ? (
                            <Loader2 className="animate-spin motion-reduce:animate-none" />
                          ) : (
                            <RotateCcw />
                          )}

                          {t("WorkspaceSetup.build.retry")}
                        </Button>
                      ) : null}

                      {phase.key === "knowledgeBase" && setup.websiteUrl ? (
                        <Button
                          disabled={store.isBusy}
                          size="xs"
                          type="button"
                          variant="ghost"
                          onClick={() => runUserAction(() => store.retryPhase(phase.key, true))}
                        >
                          {t("WorkspaceSetup.start.withoutWebsite")}
                        </Button>
                      ) : null}

                      {phase.error === "spendCap" ? <SetupSupportButton size="xs" /> : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>

        <SetupAppFrame setup={setup} />
      </div>
    </section>
  );
});
