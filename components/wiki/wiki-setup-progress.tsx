"use client";

import type { LucideIcon } from "lucide-react";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";
import type { WikiCrawlTargetStatus, WikiSynthesisTopicProgress } from "@/features/wiki/wiki-crawl-progress.schema";

import { Check, ChevronDown, Circle, Loader2, Minus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { useActivityGroupState } from "@/app/components/agent-chat/use-activity-group-state";
import { cn } from "@/core/utils/cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const activityRowClassName =
  "relative space-y-2 text-xs before:absolute before:top-0 before:-left-4 before:h-[calc(100%+0.75rem)] before:w-px before:origin-top before:animate-timeline-grow before:bg-border last:before:h-full before:motion-reduce:animate-none";

type ProgressStatus = WikiCrawlTargetStatus | "skipped";

const PROGRESS_STATUS_ICONS: Record<ProgressStatus, LucideIcon> = {
  pending: Circle,
  reading: Loader2,
  read: Check,
  failed: X,
  skipped: Minus,
};

const TOPIC_PROGRESS_STATUS: Record<WikiSynthesisTopicProgress["status"], ProgressStatus> = {
  pending: "pending",
  writing: "reading",
  created: "read",
  skipped: "skipped",
};

function StatusIcon({ status }: { status: ProgressStatus }) {
  const Icon = PROGRESS_STATUS_ICONS[status];
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "size-3.5 shrink-0",
        status === "reading" && "animate-spin motion-reduce:animate-none",
        status === "failed" && "text-destructive",
      )}
    />
  );
}

export function WikiSetupProgress({ state }: { state: WikiHomepageSetupState }) {
  const t = useTranslations();
  const progress = state.progress;
  const pages = progress?.pages ?? [];
  const discovering = state.crawlPhase === "queued" || state.crawlPhase === "discovering";
  const reading = state.crawlPhase === "fetching";
  const writing = state.crawlPhase === "importing" || state.crawlPhase === "synthesizing";
  const topics = progress?.topics ?? [];
  const createdTopics = topics.filter((topic) => topic.status === "created").length;
  const active = state.status === "working";
  const readingComplete =
    (progress?.total ?? 0) > 0 &&
    (progress?.fetched ?? 0) > 0 &&
    (progress?.fetched ?? 0) + (progress?.failed ?? 0) === progress?.total &&
    pages.every((page) => page.status === "read" || page.status === "failed");
  const hasError = state.status === "failed" && !readingComplete;
  const { open, setOpen } = useActivityGroupState({ hasRunning: active, hasError, isWorking: active });
  const discoveryStatus: ProgressStatus = discovering
    ? "reading"
    : (progress?.total ?? 0) > 0
      ? "read"
      : hasError
        ? "failed"
        : "pending";
  const readingStatus: ProgressStatus = reading
    ? "reading"
    : discovering
      ? "pending"
      : readingComplete
        ? "read"
        : hasError
          ? "failed"
          : "pending";
  const writingStatus: ProgressStatus = writing
    ? "reading"
    : topics.length > 0 && topics.every((topic) => topic.status === "created" || topic.status === "skipped")
      ? "read"
      : state.status === "failed" && readingComplete
        ? "failed"
        : "pending";
  const writingSummary = t("WikiSetup.crawlProgress.writingCount", { created: createdTopics, total: topics.length });
  const summary = discovering
    ? t("WikiSetup.crawlProgress.discovering")
    : reading
      ? t("WikiSetup.crawlProgress.readingCount", { fetched: progress?.fetched ?? 0, total: progress?.total ?? 0 })
      : writing
        ? writingSummary
        : t("WikiSetup.crawlProgress.steps");
  const pageStatusLabels: Record<ProgressStatus, string> = {
    pending: t("WikiSetup.crawlProgress.pending"),
    reading: t("WikiSetup.crawlProgress.reading"),
    read: t("WikiSetup.crawlProgress.read"),
    failed: t("WikiSetup.crawlProgress.failed"),
    skipped: t("WikiSetup.crawlProgress.failed"),
  };
  const topicStatusLabels: Record<WikiSynthesisTopicProgress["status"], string> = {
    pending: t("WikiSetup.crawlProgress.pending"),
    writing: t("WikiSetup.crawlProgress.writing"),
    created: t("WikiSetup.crawlProgress.created"),
    skipped: t("WikiSetup.crawlProgress.failed"),
  };

  return (
    <Collapsible
      aria-label={t("WikiSetup.crawlProgress.title")}
      className="group py-1 text-xs text-muted-foreground"
      data-testid="wiki-setup-crawl-progress"
      open={open}
      role="status"
      onOpenChange={setOpen}
    >
      <CollapsibleTrigger asChild>
        <button
          className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md text-left transition-colors outline-none select-none hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
          type="button"
        >
          <StatusIcon status={active ? "reading" : hasError ? "failed" : readingComplete ? "read" : "pending"} />

          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{summary}</span>

          <ChevronDown
            aria-hidden="true"
            className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3 pl-4">
        <ol className="space-y-3">
          <li aria-current={discovering ? "step" : undefined} className={activityRowClassName}>
            <div className="flex items-start gap-2 text-foreground [&>svg]:mt-0.5">
              <StatusIcon status={discoveryStatus} />

              <span className="min-w-0 [overflow-wrap:anywhere]">
                {t("WikiSetup.crawlProgress.discovering")}

                {(progress?.total ?? 0) > 0 ? (
                  <span className="ml-2 text-muted-foreground">
                    {t("WikiSetup.crawlProgress.found", { count: progress?.total ?? 0 })}
                  </span>
                ) : null}
              </span>
            </div>
          </li>

          <li
            aria-current={reading ? "step" : undefined}
            aria-label={
              readingStatus === "failed" ? t("WikiSetup.status.failedTitle") : pageStatusLabels[readingStatus]
            }
            className={activityRowClassName}
          >
            <div className="flex items-start gap-2 text-foreground [&>svg]:mt-0.5">
              <StatusIcon status={readingStatus} />

              <span>
                {t("WikiSetup.crawlProgress.readingCount", {
                  fetched: progress?.fetched ?? 0,
                  total: progress?.total ?? 0,
                })}
              </span>
            </div>

            {reading && progress?.currentUrl ? (
              <p className="pl-[1.375rem] text-foreground [overflow-wrap:anywhere]">{progress.currentUrl}</p>
            ) : null}

            {pages.length > 0 ? (
              <ul className="max-h-32 space-y-1.5 overflow-y-auto pl-[1.375rem]">
                {pages.map((page) => (
                  <li
                    key={page.url}
                    aria-label={
                      page.status === "reading" && !reading ? page.url : `${pageStatusLabels[page.status]}: ${page.url}`
                    }
                    className="flex items-start gap-2 [&>svg]:mt-0.5"
                  >
                    {page.status !== "reading" || reading ? (
                      <StatusIcon status={page.status === "failed" ? "skipped" : page.status} />
                    ) : null}

                    <span className="min-w-0 [overflow-wrap:anywhere]">{page.url}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>

          <li aria-current={writing ? "step" : undefined} className={activityRowClassName}>
            <div className="flex items-start gap-2 text-foreground [&>svg]:mt-0.5">
              <StatusIcon status={writingStatus} />

              <span>{writingSummary}</span>
            </div>

            {topics.length > 0 ? (
              <ul className="max-h-32 space-y-1.5 overflow-y-auto pl-[1.375rem]">
                {topics.map((topic) => (
                  <li
                    key={topic.title}
                    aria-label={`${topicStatusLabels[topic.status]}: ${topic.title}`}
                    className="flex items-start gap-2 [&>svg]:mt-0.5"
                  >
                    <StatusIcon status={TOPIC_PROGRESS_STATUS[topic.status]} />

                    <span className="min-w-0 [overflow-wrap:anywhere]">{topic.title}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
