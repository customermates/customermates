"use client";

import type { WorkspaceSetupFailure } from "@/ee/workspace-setup/workspace-setup.schema";

import { BookOpen, Kanban, LayoutDashboard, List, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

import { planBoards, planLists } from "./setup-plan-summary";
import {
  DashboardSketch,
  KnowledgePageList,
  PipelineBoard,
  PlaceholderLine,
  PreviewListChip,
  PreviewPanel,
  useStandardListNames,
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

const StandardSetupButton = observer(function StandardSetupButton({ onStandard }: { onStandard: () => Promise<void> }) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  return (
    <Button disabled={store.isBusy} type="button" variant="ghost" onClick={() => runUserAction(onStandard)}>
      {store.pending === "standard" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}

      {t("WorkspaceSetup.plan.standard")}
    </Button>
  );
});

export const SetupPlanPending = observer(function SetupPlanPending() {
  const t = useTranslations();
  return (
    <section aria-live="polite" className="flex flex-col items-center gap-4 py-10 text-center" role="status">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles aria-hidden className="size-6 animate-pulse motion-reduce:animate-none" />
      </span>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("WorkspaceSetup.plan.planningTitle")}</h2>

        <p className="max-w-md text-sm text-muted-foreground">{t("WorkspaceSetup.plan.planningBody")}</p>
      </div>

      <div aria-hidden className="grid w-full max-w-md gap-2">
        <PlaceholderLine pulse className="w-full" />

        <PlaceholderLine pulse className="w-5/6" />

        <PlaceholderLine pulse className="w-2/3" />
      </div>
    </section>
  );
});

export const SetupPlanFailed = observer(function SetupPlanFailed({ onStandard }: { onStandard: () => Promise<void> }) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const failureMessage = useSetupFailureMessage();
  return (
    <section className="flex flex-col gap-5">
      <Alert
        color="danger"
        description={failureMessage(store.setup?.plan.error ?? null)}
        title={t("WorkspaceSetup.plan.failedTitle")}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StandardSetupButton onStandard={onStandard} />

        <div className="flex flex-wrap gap-2">
          <Button disabled={store.isBusy} type="button" variant="secondary" onClick={store.adjust}>
            {t("WorkspaceSetup.plan.adjust")}
          </Button>

          <Button disabled={store.isBusy} type="button" onClick={() => runUserAction(store.replan)}>
            {store.pending === "plan" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <RotateCcw />}

            {t("WorkspaceSetup.plan.tryAgain")}
          </Button>
        </div>
      </div>
    </section>
  );
});

export const SetupPlanPreview = observer(function SetupPlanPreview({
  onStandard,
}: {
  onStandard: () => Promise<void>;
}) {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const standardNames = useStandardListNames();
  const plan = store.setup?.plan.plan;
  if (!plan) return <SetupPlanPending />;
  const lists = planLists(plan);
  const boards = planBoards(plan);
  const listName = (key: string) => {
    const list = lists.find((candidate) => candidate.key === key);
    return list?.label ?? (list?.standard ? standardNames[list.standard] : key);
  };
  const withFields = lists.filter((list) => list.fields.length > 0);
  const sampleTotal = lists.reduce((total, list) => total + list.sampleCount, 0);
  const spreadsheet = store.setup?.spreadsheet;

  return (
    <section className="flex animate-page-result-in flex-col gap-5 motion-reduce:animate-none">
      <div className="grid gap-4 lg:grid-cols-2">
        <PreviewPanel icon={List} title={t("WorkspaceSetup.plan.lists")}>
          <div className="flex flex-wrap gap-1.5">
            {lists.map((list) => (
              <PreviewListChip
                key={list.key}
                color={list.color}
                icon={list.icon}
                label={list.label ?? (list.standard ? standardNames[list.standard] : list.key)}
              />
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
            <p className="text-xs text-muted-foreground">{t("WorkspaceSetup.plan.standardPipeline")}</p>
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

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <StandardSetupButton onStandard={onStandard} />

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button disabled={store.isBusy} type="button" variant="secondary" onClick={store.adjust}>
            {t("WorkspaceSetup.plan.adjust")}
          </Button>

          <Button disabled={store.isBusy} type="button" onClick={() => runUserAction(store.build)}>
            {store.pending === "build" ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Sparkles />}

            {t("WorkspaceSetup.plan.build")}
          </Button>
        </div>
      </div>
    </section>
  );
});
