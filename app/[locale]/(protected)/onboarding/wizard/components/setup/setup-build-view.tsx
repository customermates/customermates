"use client";

import type { LucideIcon } from "lucide-react";
import type { WorkspaceSetupPhase } from "@/ee/workspace-setup/workspace-setup.schema";
import type { WorkspaceSetupView } from "@/ee/workspace-setup/workspace-setup-status";
import type { BuildBoard } from "./setup-build-state";
import type { SetupTimelineRow } from "./setup-timeline";
import type { SetupPreviewList } from "./setup-plan-summary";

import { BookOpen, FileText, Kanban, LayoutDashboard, Loader2, RotateCcw, Rows3 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  sidebarMenuButtonVariants,
} from "@/components/ui/sidebar";
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
  buildRecordCount,
  buildTable,
  canRetryPhase,
  phaseActive,
  phaseDone,
  phaseSettled,
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
import { SetupTimeline } from "./setup-timeline";

function listLabel(list: SetupPreviewList) {
  return list.label ?? list.key;
}

type FrameProps = { setup: WorkspaceSetupView; lists: SetupPreviewList[]; board: BuildBoard | null };

const SetupAppFrame = observer(function SetupAppFrame({ setup, lists, board }: FrameProps) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const table = buildTable(setup, lists, board?.list.key ?? null);
  const plan = setup.plan.plan;
  const planStages = plan ? planBoards(plan) : [];
  const boardColors = planStages.find((candidate) => candidate.list === board?.list.key)?.stages ?? [];
  const modelReady = phaseDone(setup, "dataModel");
  const companyName = store.answers.companyName?.value;
  const widgets = setup.results.widgets;
  const plannedWidgets = plan?.dashboard.widgets.length ?? 0;
  const pages = setup.results.pages;
  const plannedPages = Math.max(plan?.knowledgeBase.pages.length ?? 0, setup.knowledgeBase.pagesPlanned);
  const recordsSettled = phaseSettled(setup, "records");

  const menuItem = (active = false) =>
    sidebarMenuButtonVariants({ className: cn("pointer-events-none", active && "font-medium") });

  return (
    <div
      aria-label={t("WorkspaceSetup.build.previewLabel")}
      className="flex min-h-[26rem] min-w-0 overflow-hidden rounded-xl border border-border bg-sidebar text-sidebar-foreground shadow-xl shadow-primary/5"
      role="group"
    >
      <nav aria-label={t("WorkspaceSetup.build.sidebarLabel")} className="hidden w-48 shrink-0 flex-col sm:flex">
        <SidebarHeader>
          <span className="truncate px-2 py-1.5 text-sm font-semibold">
            {companyName?.format === "shortText" && companyName.value
              ? companyName.value
              : t("WorkspaceSetup.build.frameTitle")}
          </span>
        </SidebarHeader>

        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <span data-active className={menuItem(true)}>
                <LayoutDashboard aria-hidden />

                <span>{t("WorkspaceSetup.plan.dashboard")}</span>
              </span>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("WorkspaceSetup.plan.lists")}</SidebarGroupLabel>

          <SidebarMenu>
            {lists.map((list) => (
              <SidebarMenuItem key={list.key}>
                {list.ready || modelReady ? (
                  <span className={cn(menuItem(), "animate-page-result-in motion-reduce:animate-none")}>
                    <RecordTypeGlyph className="size-4" icon={list.icon} />

                    <span>{listLabel(list)}</span>
                  </span>
                ) : (
                  <span className={menuItem()}>
                    <PlaceholderLine className="size-4 rounded-sm" pulse={phaseActive(setup, "dataModel")} />

                    <PlaceholderLine className="w-20" pulse={phaseActive(setup, "dataModel")} />
                  </span>
                )}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <span className={menuItem()}>
                <BookOpen aria-hidden />

                <span>{t("WorkspaceSetup.plan.knowledgeBase")}</span>
              </span>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </nav>

      <div className="m-2 flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-background p-3 shadow-sm sm:ml-0">
        {board ? (
          <FramePanel icon={Kanban} title={listLabel(board.list)}>
            <PipelineBoard
              placeholders={!recordsSettled}
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
          {!table && recordsSettled ? (
            <p className="text-xs text-muted-foreground">
              {t("WorkspaceSetup.build.summaries.records", { count: buildRecordCount(setup) })}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("WorkspaceSetup.build.nameColumn")}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {table
                  ? table.titles.slice(0, 5).map((title, index) => (
                      <TableRow key={index} className="animate-page-result-in motion-reduce:animate-none">
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
          )}
        </FramePanel>

        <FramePanel icon={LayoutDashboard} title={t("WorkspaceSetup.plan.dashboard")}>
          {widgets.length ? (
            <DashboardSketch
              tiles={widgets.map((widget) => ({ key: widget.id, title: widget.title, display: widget.display }))}
            />
          ) : phaseSettled(setup, "dashboard") ? (
            <p className="text-xs text-muted-foreground">
              {t("WorkspaceSetup.build.summaries.dashboard", { count: 0 })}
            </p>
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
          ) : phaseSettled(setup, "knowledgeBase") ? (
            <p className="text-xs text-muted-foreground">
              {t("WorkspaceSetup.build.summaries.knowledgeBase", { count: setup.knowledgeBase.pagesWritten })}
            </p>
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

type Props = { onContinue: () => Promise<void>; continuing: boolean };

export const SetupBuildView = observer(function SetupBuildView({ onContinue, continuing }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const { workspaceSetupStore: store, navigationGuard } = useRootStore();
  const failureMessage = useSetupFailureMessage();
  const heading = useRef<HTMLHeadingElement>(null);
  const [retrying, setRetrying] = useState<WorkspaceSetupPhase | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const setup = store.setup;
  const outcome = setup ? buildOutcome(setup) : "running";

  useEffect(() => {
    if (outcome !== "completed" || advanced) return;
    setAdvanced(true);
    runUserAction(onContinue);
  }, [advanced, onContinue, outcome]);

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
  const lists = buildLists(setup);
  const board = buildBoard(setup, lists);
  const recordCount = buildRecordCount(setup);
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
  const summary =
    outcome === "completed"
      ? t("WorkspaceSetup.build.completedBody")
      : outcome === "failed"
        ? t("WorkspaceSetup.build.failedBody")
        : setup.currentPhase
          ? actions[setup.currentPhase]
          : t("WorkspaceSetup.build.actions.preparing");
  const phaseWithState = (phase: WorkspaceSetupPhase, state: string) => (
    <>
      {phaseLabels[phase]}

      <span className="ml-2 text-muted-foreground">{state}</span>
    </>
  );
  const rows: SetupTimelineRow[] = setup.phases.flatMap((phase): SetupTimelineRow[] => {
    const state = buildPhaseState(phase);
    const background =
      outcome !== "running" &&
      phase.key === "knowledgeBase" &&
      (phase.status === "running" || phase.status === "pending");
    if (background) {
      return [
        {
          key: phase.key,
          status: "running",
          label: phaseWithState(phase.key, t("WorkspaceSetup.build.states.background")),
        },
      ];
    }
    if (state === "waiting") return [];
    if (state === "active") return [{ key: phase.key, status: "running", label: actions[phase.key] }];
    if (state === "done") return [{ key: phase.key, status: "done", label: summaries[phase.key] }];
    if (state === "skipped") {
      return [
        {
          key: phase.key,
          status: "cancelled",
          label: phaseWithState(phase.key, t("WorkspaceSetup.build.states.skipped")),
        },
      ];
    }
    return [
      {
        key: phase.key,
        status: "error",
        label: (
          <span className="flex flex-col gap-2">
            <span>{phaseWithState(phase.key, t("WorkspaceSetup.build.states.failed"))}</span>

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
            </span>
          </span>
        ),
      },
    ];
  });

  return (
    <section aria-busy={outcome === "running"} className="flex w-full max-w-6xl flex-col gap-6 py-2">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 ref={heading} className="text-2xl font-semibold outline-none" tabIndex={-1}>
            {outcome === "completed"
              ? t("WorkspaceSetup.build.completedTitle")
              : outcome === "failed"
                ? t("WorkspaceSetup.build.failedTitle")
                : t("WorkspaceSetup.build.title")}
          </h1>

          <SetupTimeline
            rows={rows}
            status={outcome === "failed" ? "error" : rows.some((row) => row.status === "running") ? "running" : "done"}
            summary={summary}
          />

          {outcome === "running" ? (
            <p className="text-xs text-muted-foreground">{t("WorkspaceSetup.build.keepsRunning")}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
          {outcome === "completed" && advanced && !continuing ? (
            <Button disabled={store.isBusy} type="button" onClick={() => runUserAction(onContinue)}>
              {t("WorkspaceSetup.build.continue")}
            </Button>
          ) : null}

          {outcome === "failed" ? (
            <Button
              disabled={store.isBusy || continuing}
              type="button"
              variant="secondary"
              onClick={() => runUserAction(onContinue)}
            >
              {continuing ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

              {t("WorkspaceSetup.actions.continueAnyway")}
            </Button>
          ) : null}
        </div>
      </header>

      <SetupAppFrame board={board} lists={lists} setup={setup} />
    </section>
  );
});
