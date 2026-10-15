"use client";

import type { WorkspaceSetupFailure } from "@/ee/workspace-setup/workspace-setup.schema";

import { BookOpen, Kanban, LayoutDashboard, List, Loader2, Mail, RotateCcw, Sparkles } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Alert } from "@/components/shared/alert";
import { IconContainer } from "@/components/shared/icon-container";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { contactHref } from "@/core/utils/contact-href";

import { planBoards, planLists } from "./setup-plan-summary";
import {
  DashboardSketch,
  KnowledgePageList,
  PipelineBoard,
  PlaceholderLine,
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
        const href = contactHref("email", "support@customermates.com");
        if (href)
          window.location.assign(`${href}?subject=${encodeURIComponent(t("WorkspaceSetup.failures.supportSubject"))}`);
      }}
    >
      <Mail />

      {t("WorkspaceSetup.failures.contactSupport")}
    </Button>
  );
}

export const SetupPlanPending = observer(function SetupPlanPending() {
  const t = useTranslations();
  return (
    <section
      aria-live="polite"
      className="flex animate-page-empty-in flex-col items-center gap-5 py-10 text-center motion-reduce:animate-none"
      role="status"
    >
      <IconContainer icon={Sparkles} size="md" />

      <div className="flex max-w-md flex-col gap-2">
        <h2 className="text-base font-medium text-foreground">{t("WorkspaceSetup.plan.planningTitle")}</h2>

        <p className="text-sm leading-relaxed text-muted-foreground">{t("WorkspaceSetup.plan.planningBody")}</p>
      </div>

      <div aria-hidden className="grid w-full max-w-md gap-2">
        <PlaceholderLine pulse className="w-full" />

        <PlaceholderLine pulse className="w-5/6" />

        <PlaceholderLine pulse className="w-2/3" />
      </div>
    </section>
  );
});

export const SetupPlanFailed = observer(function SetupPlanFailed() {
  const t = useTranslations();
  const { workspaceSetupStore: store } = useRootStore();
  const failureMessage = useSetupFailureMessage();
  const error = store.setup?.plan.error ?? null;
  return (
    <section className="flex flex-col gap-5">
      <Alert color="danger" description={failureMessage(error)} title={t("WorkspaceSetup.plan.failedTitle")} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {error === "spendCap" ? (
          <SetupSupportButton />
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

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
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
