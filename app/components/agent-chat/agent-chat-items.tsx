"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Copy, Loader2, Square, X } from "lucide-react";

import type { AgentChatItem } from "./agent-chat.store";

import { agentActivityCopy, agentActivityGroupSummary } from "@/ee/agent-chat/agent-activity";

import { useActivityGroupState } from "./use-activity-group-state";
import { useSteadyLabel } from "./use-steady-label";
import { useAgentChatStore, useAgentChatUiTargets } from "./agent-chat-store-context";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { runUserAction } from "@/core/errors/report-application-error";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { AppLink } from "@/components/shared/app-link";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageResponse } from "@/components/ai-elements/message";
import { agentMessageComponents, agentMessageRehypePlugins } from "./agent-message-links";
import { cn } from "@/core/utils/cn";
import { dataViewNavigationHref } from "@/core/data-view/data-view-links";
import { ActionTooltip, ItemTime, TypingDots, chatUiCopy, focusAgentComposer } from "./chat-ui";
import { AgentComposerContexts } from "./agent-composer-contexts";

export const AgentChatItemView = observer(function AgentChatItemView({
  item,
  readOnly = false,
  userLabel,
}: {
  item: Exclude<AgentChatItem, { kind: "activity" }>;
  readOnly?: boolean;
  userLabel?: string;
}) {
  const store = useAgentChatStore();
  const uiTargets = useAgentChatUiTargets();
  const t = useTranslations();
  const copyToClipboard = useCopyToClipboard();
  const decideApproval = async (
    approval: Extract<AgentChatItem, { kind: "approval" }>,
    decision: "approve" | "reject",
  ) => {
    await store.respondToApproval(approval, decision);
    if (approval.submittedDecision || approval.resolution) focusAgentComposer(uiTargets);
  };

  if (item.kind === "user") {
    return (
      <article aria-label={userLabel ?? t("Inbox.senderYou")} className="group/message flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-1">
          {userLabel && <span className="text-subdued text-xs">{userLabel}</span>}

          <div className="w-fit min-w-16 max-w-full rounded-xl rounded-br-md bg-muted px-3.5 py-2 text-sm leading-5 shadow-xs dark:bg-accent/60">
            <AgentComposerContexts contexts={item.contexts ?? []} />

            <span className="whitespace-pre-wrap">{item.text}</span>
          </div>

          <ItemTime at={item.at} />
        </div>
      </article>
    );
  }

  if (item.kind === "assistant") {
    return (
      <article aria-label={t("AgentChat.title")} className="group/message flex flex-col gap-1.5">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <div className="w-full text-sm leading-relaxed [&_pre]:overflow-x-auto">
            <MessageResponse
              components={agentMessageComponents}
              mode={item.streaming ? "streaming" : "static"}
              rehypePlugins={agentMessageRehypePlugins}
              showTableActions={!item.streaming}
            >
              {item.text}
            </MessageResponse>
          </div>

          {!item.streaming && item.text.trim() && (
            <ActionTooltip label={t("Common.actions.copy")}>
              <Button
                aria-label={t("Common.actions.copy")}
                className="size-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover/message:opacity-100"
                size="icon"
                variant="ghost"
                onClick={() => runUserAction(() => copyToClipboard(item.text))}
              >
                <Copy className="size-3.5" />
              </Button>
            </ActionTooltip>
          )}

          {!item.streaming && <ItemTime at={item.at} />}
        </div>
      </article>
    );
  }

  if (item.kind === "turn_interrupted") {
    return (
      <Alert color="warning" data-testid="agent-turn-interrupted" description={t("AgentChat.ui.turnInterrupted")} />
    );
  }

  if (item.kind === "turn_error") {
    const copy = chatUiCopy(t);
    return (
      <Alert color="danger" description={copy.turnFailed}>
        {!readOnly && (
          <Button
            className="mt-2"
            disabled={store.isWorking || Boolean(store.usage?.blockedReason) || !store.canRetryFailedTurn(item)}
            size="sm"
            variant="secondary"
            onClick={() => {
              store.retryFailedTurn(item);
              focusAgentComposer(uiTargets);
            }}
          >
            {copy.retryTurn}
          </Button>
        )}
      </Alert>
    );
  }

  const copy = agentActivityCopy(item.activity, t);

  return (
    <div className="rounded-2xl border px-4 py-3.5 text-sm" data-testid="agent-approval">
      <p className="text-xs font-medium text-muted-foreground">{t("AgentChat.approval.title")}</p>

      <p className="mt-1 font-medium">{copy.approval}</p>

      {item.activity.consequence && copy.detail && <p className="mt-1 text-xs text-muted-foreground">{copy.detail}</p>}

      {item.resolution ? (
        <p className="mt-3 text-xs text-muted-foreground">{t(`AgentChat.approval.${item.resolution}`)}</p>
      ) : item.submittedDecision ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />

          {t("AgentChat.approval.resuming")}
        </p>
      ) : readOnly ? null : (
        <div className="mt-3 space-y-2">
          {item.retryDecision && <p className="text-xs text-muted-foreground">{t("AgentChat.approval.retryResume")}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-busy={item.pendingDecision === "approve"}
              disabled={Boolean(item.pendingDecision) || item.retryDecision === "reject"}
              size="sm"
              onClick={() => runUserAction(() => decideApproval(item, "approve"))}
            >
              {item.pendingDecision === "approve" && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}

              {t("AgentChat.approval.approveOnceAction")}
            </Button>

            <Button
              aria-busy={item.pendingDecision === "reject"}
              disabled={Boolean(item.pendingDecision) || item.retryDecision === "approve"}
              size="sm"
              variant="ghost"
              onClick={() => runUserAction(() => decideApproval(item, "reject"))}
            >
              {item.pendingDecision === "reject" && <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />}

              {t("AgentChat.approval.rejectAction")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

export function consecutiveActivityItems(items: AgentChatItem[], start: number) {
  const activities: Extract<AgentChatItem, { kind: "activity" }>[] = [];
  for (let index = start; index < items.length; index += 1) {
    const item = items[index];
    if (item?.kind !== "activity") break;
    activities.push(item);
  }
  return activities;
}

export function isWorkingActivityGroup(items: AgentChatItem[], start: number, isWorking: boolean) {
  if (!isWorking) return false;
  return start > items.findLastIndex((item) => item.kind === "user");
}

type ActivityItem = Extract<AgentChatItem, { kind: "activity" }>;

export function compactActivityItems(items: ActivityItem[]) {
  const rows: Array<ActivityItem & { repetitions: number }> = [];
  for (const item of items) {
    const previous = rows.at(-1);
    const canGroup =
      item.activity.risk === "read" &&
      item.activity.kind === "generic" &&
      (item.status === "done" || item.status === "running");
    if (
      canGroup &&
      previous &&
      (previous.status === "done" || previous.status === "running") &&
      previous.turnKey === item.turnKey &&
      JSON.stringify(previous.activity) === JSON.stringify(item.activity)
    ) {
      previous.repetitions += 1;
      if (item.status === "running") previous.status = "running";
    } else rows.push({ ...item, repetitions: 1 });
  }
  return rows;
}

export const AgentActivity = observer(function AgentActivity({
  isWorking,
  isTrailing,
  items,
}: {
  isWorking: boolean;
  isTrailing: boolean;
  items: Extract<AgentChatItem, { kind: "activity" }>[];
}) {
  const t = useTranslations();
  const rows = compactActivityItems(items);
  const activityCopy = (item: (typeof rows)[number]) => {
    const copy = agentActivityCopy(item.activity, t);
    return item.activity.kind === "generic" && item.repetitions > 1
      ? {
          ...copy,
          done: agentActivityGroupSummary(
            Array.from({ length: item.repetitions }, () => "done" as const),
            t,
          ),
        }
      : copy;
  };
  const uiCopy = chatUiCopy(t);
  const hasRunning = items.some((item) => item.status === "running");
  const isPending = isWorking && isTrailing;
  const hasError = items.some((item) => item.status === "error");
  const hasCancelled = items.some((item) => item.status === "cancelled");
  const hasDetails = rows.length > 1;
  const isRecovering = isWorking && hasError;
  const isActive = hasRunning || isRecovering || isPending;
  const { open, setOpen, elapsedSeconds } = useActivityGroupState({
    hasError: hasError && !isRecovering,
    hasRunning: isActive,
    isWorking,
    startedAt: items[0]?.at,
  });

  const firstCopy = rows[0] ? activityCopy(rows[0]) : null;
  const settledSummary =
    rows.length === 1 && firstCopy
      ? hasError
        ? firstCopy.error
        : hasCancelled
          ? firstCopy.cancelled
          : firstCopy.done
      : agentActivityGroupSummary(
          rows.map((item) => item.status),
          t,
        );
  const runningItem = items.findLast((item) => item.status === "running" || (isRecovering && item.status === "error"));
  const runningLabel = runningItem ? agentActivityCopy(runningItem.activity, t).running : uiCopy.thinking;
  const liveSummary =
    hasDetails && !hasError && !hasCancelled && elapsedSeconds !== null
      ? uiCopy.stepsTook(rows.length, elapsedSeconds)
      : settledSummary;
  const summary = useSteadyLabel(isActive ? runningLabel : liveSummary);
  const viewHref = items.findLast((item) => {
    if (item.status !== "done" || item.activity.kind !== "views.configure") return false;
    return dataViewNavigationHref(item.activity.viewHref) !== null;
  })?.activity.viewHref;
  const statusIcon = isActive ? (
    <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
  ) : hasError ? (
    <X aria-hidden="true" className="size-3.5 text-destructive" />
  ) : hasCancelled ? (
    <Square aria-hidden="true" className="size-3.5" />
  ) : (
    <Check aria-hidden="true" className="size-3.5" />
  );

  return (
    <Collapsible aria-live="off" className="group py-1" data-testid="agent-activity" open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        {hasDetails ? (
          <CollapsibleTrigger asChild>
            <button
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-xs text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
              type="button"
            >
              {statusIcon}

              <span className="min-w-0 flex-1 text-left [overflow-wrap:anywhere]">{summary}</span>

              <ChevronDown
                aria-hidden="true"
                className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
              />
            </button>
          </CollapsibleTrigger>
        ) : (
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground",
              hasError && !isRecovering && "text-destructive",
            )}
          >
            {statusIcon}

            <span className="min-w-0 flex-1 text-left [overflow-wrap:anywhere]">{summary}</span>
          </div>
        )}

        {viewHref && (
          <Button asChild size="xs" variant="ghost">
            <AppLink appearance="unstyled" href={viewHref}>
              {t("AgentChat.openSavedView")}
            </AppLink>
          </Button>
        )}
      </div>

      {hasDetails && (
        <CollapsibleContent className="mt-3 space-y-3 pl-4 [&>*]:fade-in-0 [&>*]:slide-in-from-top-2 [&>*]:animate-in [&>*]:duration-300 [&>*]:motion-reduce:animate-none">
          {rows.map((item) => {
            const copy = activityCopy(item);
            const status = isRecovering && item.status === "error" ? "running" : item.status;
            const label =
              status === "running"
                ? copy.running
                : status === "error"
                  ? copy.error
                  : status === "cancelled"
                    ? copy.cancelled
                    : copy.done;

            return (
              <div
                key={item.id}
                className={cn(
                  "relative flex gap-2 text-xs",
                  "before:absolute before:top-0 before:-left-4 before:h-[calc(100%+0.75rem)] before:w-px before:bg-border",
                  "before:origin-top before:animate-timeline-grow before:motion-reduce:animate-none",
                  "last:before:h-full",
                  status === "error" && "text-destructive",
                )}
              >
                {status === "running" ? (
                  <Loader2
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                  />
                ) : status === "error" ? (
                  <X aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                ) : status === "cancelled" ? (
                  <Square aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                )}

                <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
              </div>
            );
          })}

          {isPending && !hasRunning && (
            <div
              aria-hidden="true"
              className={cn(
                "relative flex gap-2 text-xs",
                "before:absolute before:top-0 before:-left-4 before:h-full before:w-px before:bg-border",
                "before:origin-top before:animate-timeline-grow before:motion-reduce:animate-none",
              )}
            >
              <span className="mt-1 flex size-3.5 shrink-0 items-center justify-center">
                <TypingDots />
              </span>
            </div>
          )}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
});
