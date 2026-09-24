"use client";

import type { RefObject } from "react";

import { observer } from "mobx-react-lite";
import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, Loader2, Square } from "lucide-react";

import { MessageDateSeparator, isSameDay } from "@/app/[locale]/(protected)/inbox/components/message-date-separator";
import { MessagesScrollContainer } from "@/components/scroll/messages-scroll-container";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { runUserAction } from "@/core/errors/report-application-error";

import { ActionTooltip, chatUiCopy } from "./chat-ui";
import { AgentActivity, AgentChatItemView, consecutiveActivityItems, isWorkingActivityGroup } from "./agent-chat-items";
import { AgentInitialProgress } from "./agent-status-announcer";
import { AgentComposerContexts } from "./agent-composer-contexts";
import { AgentContextPicker } from "./agent-context-picker";
import { isAgentContextSlashCommand } from "./agent-context-shortcut";
import { CreditBlockedNotice } from "./credit-blocked-notice";
import { QueuedPrompt } from "./queued-prompt";
import { UsageRing } from "./usage-ring";
import { useAgentChatStore, useAgentChatUiTargets } from "./agent-chat-store-context";

export const AgentConversationLog = observer(function AgentConversationLog({
  readOnly = false,
  scrollContainerRef,
  scrollFooterRef,
  scrollable = true,
  userLabel,
}: {
  readOnly?: boolean;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  scrollFooterRef?: RefObject<HTMLElement | null>;
  scrollable?: boolean;
  userLabel?: string;
}) {
  const store = useAgentChatStore();
  const t = useTranslations();
  const copy = chatUiCopy(t);

  return (
    <MessagesScrollContainer
      className="px-3"
      jumpToLatestLabel={copy.jumpToLatest}
      latestItemKey={store.items.at(-1)?.id}
      loadOlderLabel={copy.loadOlderMessages}
      scrollContainerRef={scrollContainerRef}
      scrollFooterRef={scrollFooterRef}
      scrollKey={store.conversationId ?? "new"}
      scrollRegionLabel={t("AgentChat.title")}
      scrollable={scrollable}
      onTopReach={store.olderMessagesCursor ? store.loadOlderMessages : undefined}
    >
      <div aria-atomic="false" aria-busy={store.isWorking} aria-live="off" className="space-y-3" role="log">
        {store.olderMessagesPending && (
          <div className="flex justify-center py-1" role="status">
            <Loader2 aria-label={copy.loadingOlderMessages} className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {store.items.map((item, index) => {
          const prev = store.items[index - 1];
          const showSeparator = item.at && (!prev?.at || !isSameDay(prev.at, item.at));

          return (
            <Fragment key={item.id}>
              {showSeparator && item.at && <MessageDateSeparator date={item.at} />}

              {item.kind === "activity" ? (
                prev?.kind === "activity" ? null : (
                  <ActivityGroup index={index} />
                )
              ) : (
                <AgentChatItemView item={item} readOnly={readOnly} userLabel={userLabel} />
              )}
            </Fragment>
          );
        })}

        <AgentInitialProgress />
      </div>
    </MessagesScrollContainer>
  );
});

export const AgentComposer = observer(function AgentComposer() {
  const store = useAgentChatStore();
  const uiTargets = useAgentChatUiTargets();
  const t = useTranslations();
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [contextPickerOpenedBySlash, setContextPickerOpenedBySlash] = useState(false);
  const usage = store.usage;
  const blocked = usage?.blockedReason ?? null;

  const submit = () => {
    if (blocked) return;
    store.submitDraft();
  };

  return (
    <div className="px-3 pt-2 pb-3">
      <div className="rounded-xl border border-input bg-input-background p-2 shadow-xs transition-[color,box-shadow] focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:ring-inset">
        {store.queuedPrompt && <QueuedPrompt />}

        {blocked && usage ? (
          <CreditBlockedNotice usage={usage} />
        ) : (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <div
                className="flex max-h-40 min-h-9 min-w-0 flex-wrap items-center gap-1 overflow-y-auto px-1 py-1.5"
                data-testid="agent-composer-input-line"
              >
                <AgentComposerContexts contexts={store.composerContexts} onRemove={store.removeComposerContext} />

                <Textarea
                  aria-label={t("AgentChat.placeholder")}
                  className="max-h-36 min-h-5 min-w-24 w-auto flex-[1_1_6rem] resize-none border-0 bg-transparent p-0 leading-5 shadow-none focus-visible:border-0 focus-visible:ring-0"
                  data-testid="agent-composer"
                  id={uiTargets.composerId}
                  placeholder={t("AgentChat.placeholder")}
                  rows={1}
                  value={store.composerDraft}
                  onChange={(event) => store.setComposerDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      isAgentContextSlashCommand({
                        altKey: event.altKey,
                        ctrlKey: event.ctrlKey,
                        isComposing: event.nativeEvent.isComposing,
                        key: event.key,
                        metaKey: event.metaKey,
                        selectionEnd: event.currentTarget.selectionEnd,
                        selectionStart: event.currentTarget.selectionStart,
                        value: event.currentTarget.value,
                      })
                    ) {
                      event.preventDefault();
                      setContextPickerOpenedBySlash(true);
                      setContextPickerOpen(true);
                      return;
                    }

                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
              </div>

              <AgentContextPicker
                open={contextPickerOpen}
                restoreComposerFocusOnEscape={contextPickerOpenedBySlash}
                onOpenChange={(open) => {
                  if (open) setContextPickerOpenedBySlash(false);
                  setContextPickerOpen(open);
                }}
              />
            </div>

            <UsageRing />

            {store.isWorking ? (
              <ActionTooltip label={t("AgentChat.stop")}>
                <Button
                  aria-label={t("AgentChat.stop")}
                  className="size-9 shrink-0 rounded-full border-destructive/60 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={!store.canInterrupt}
                  size="icon"
                  variant="secondary"
                  onClick={() => runUserAction(() => store.interrupt())}
                >
                  <Square className="size-3.5" />
                </Button>
              </ActionTooltip>
            ) : (
              <ActionTooltip label={t("AgentChat.send")}>
                <Button
                  aria-label={t("AgentChat.send")}
                  className="size-9 shrink-0 rounded-full"
                  disabled={!store.composerDraft.trim() || Boolean(store.queuedPrompt)}
                  size="icon"
                  onClick={submit}
                >
                  <ArrowUp className="size-4" />
                </Button>
              </ActionTooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const ActivityGroup = observer(function ActivityGroup({ index }: { index: number }) {
  const store = useAgentChatStore();
  const items = consecutiveActivityItems(store.items, index);

  return (
    <AgentActivity
      isTrailing={index + items.length === store.items.length}
      isWorking={isWorkingActivityGroup(store.items, index, store.isWorking)}
      items={items}
    />
  );
});
