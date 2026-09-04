"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Copy, Loader2, Square, X } from "lucide-react";
import { EntityType } from "@/generated/prisma";

import type { AgentChatItem } from "./agent-chat.store";

import {
  agentActivityCopy,
  agentActivityGroupSummary,
  type AgentActivityResource,
} from "@/ee/agent-chat/agent-activity";

import { useActivityGroupState } from "./use-activity-group-state";
import { useSteadyLabel } from "./use-steady-label";
import { useAgentChatStore } from "./agent-chat-store-context";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { runUserAction } from "@/core/errors/report-application-error";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { cn } from "@/core/utils/cn";
import { ActionTooltip, ItemTime, TypingDots, chatUiCopy, focusAgentComposer } from "./chat-ui";

export function useAgentActivityTerminology(): Partial<Record<AgentActivityResource, string>> {
  const { plural } = useEntityTerminology();
  return {
    contacts: plural(EntityType.contact),
    organizations: plural(EntityType.organization),
    deals: plural(EntityType.deal),
    services: plural(EntityType.service),
    tasks: plural(EntityType.task),
  };
}

export const AgentChatItemView = observer(function AgentChatItemView({
  item,
  readOnly = false,
}: {
  item: Exclude<AgentChatItem, { kind: "activity" }>;
  readOnly?: boolean;
}) {
  const store = useAgentChatStore();
  const t = useTranslations();
  const copyToClipboard = useCopyToClipboard();
  const terminology = useAgentActivityTerminology();
  const decideApproval = async (
    approval: Extract<AgentChatItem, { kind: "approval" }>,
    decision: "approve" | "reject",
  ) => {
    await store.respondToApproval(approval, decision);
    if (approval.submittedDecision || approval.resolution) focusAgentComposer();
  };

  if (item.kind === "user") {
    return (
      <article aria-label={t("Inbox.senderYou")} className="group/message flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-1">
          <div className="w-fit min-w-16 rounded-xl rounded-br-md bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap shadow-xs dark:bg-accent/60">
            {item.text}
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
            <MessageResponse mode={item.streaming ? "streaming" : "static"} showTableActions={!item.streaming}>
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

  if (item.kind === "turn_error") {
    const copy = chatUiCopy(t);
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs"
        role="alert"
      >
        <span>{copy.turnFailed}</span>

        {!readOnly && (
          <Button
            className="shrink-0"
            disabled={store.isWorking || Boolean(store.usage?.blockedReason) || !store.canRetryFailedTurn(item)}
            size="sm"
            variant="secondary"
            onClick={() => {
              store.retryFailedTurn(item);
              focusAgentComposer();
            }}
          >
            {copy.retryTurn}
          </Button>
        )}
      </div>
    );
  }

  const copy = agentActivityCopy(item.activity, t, terminology);

  return (
    <div className="rounded-2xl border px-4 py-3.5 text-sm" data-testid="agent-approval">
      <p className="text-xs font-medium text-muted-foreground">{t("AgentChat.approval.title")}</p>

      <p className="mt-1 font-medium">{copy.running}</p>

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
  const uiCopy = chatUiCopy(t);
  const terminology = useAgentActivityTerminology();
  const hasRunning = items.some((item) => item.status === "running");
  const isPending = isWorking && isTrailing;
  const hasError = items.some((item) => item.status === "error");
  const hasCancelled = items.some((item) => item.status === "cancelled");
  const { open, setOpen, elapsedSeconds } = useActivityGroupState({
    hasError,
    hasRunning: hasRunning || isPending,
    isWorking,
    startedAt: items[0]?.at,
  });

  const firstCopy = items[0] ? agentActivityCopy(items[0].activity, t, terminology) : null;
  const settledSummary =
    items.length === 1 && firstCopy
      ? hasError
        ? firstCopy.error
        : hasCancelled
          ? firstCopy.cancelled
          : firstCopy.done
      : agentActivityGroupSummary(
          items.map((item) => item.status),
          t,
        );
  const runningItem = items.find((item) => item.status === "running");
  const runningLabel = runningItem ? agentActivityCopy(runningItem.activity, t, terminology).running : uiCopy.thinking;
  const liveSummary =
    !hasError && !hasCancelled && elapsedSeconds !== null
      ? uiCopy.stepsTook(items.length, elapsedSeconds)
      : settledSummary;
  const summary = useSteadyLabel(hasRunning || isPending ? runningLabel : liveSummary);

  return (
    <details
      aria-live="off"
      className="group py-1"
      data-testid="agent-activity"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-muted-foreground transition-colors select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        {hasRunning || isPending ? (
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        ) : hasError ? (
          <X aria-hidden="true" className="size-3.5 text-destructive" />
        ) : hasCancelled ? (
          <Square aria-hidden="true" className="size-3.5" />
        ) : (
          <Check aria-hidden="true" className="size-3.5" />
        )}

        <span className="flex-1 text-left">{summary}</span>

        <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-3 space-y-3 pl-4 [&>*]:fade-in-0 [&>*]:slide-in-from-top-2 [&>*]:animate-in [&>*]:duration-300 [&>*]:motion-reduce:animate-none">
        {items.map((item) => {
          const copy = agentActivityCopy(item.activity, t, terminology);
          const label =
            item.status === "running"
              ? copy.running
              : item.status === "error"
                ? copy.error
                : item.status === "cancelled"
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
                item.status === "error" && "text-destructive",
              )}
            >
              {item.status === "running" ? (
                <Loader2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 animate-spin" />
              ) : item.status === "error" ? (
                <X aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              ) : item.status === "cancelled" ? (
                <Square aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              )}

              <span className="min-w-0 text-foreground">{label}</span>
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
      </div>
    </details>
  );
});
