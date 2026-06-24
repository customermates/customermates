"use client";

import { Inbox, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { Action, Resource } from "@/generated/prisma";

import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { ThreadDetail } from "./messaging-thread-detail.store";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { deriveThreadDisplay } from "@/ee/messaging/thread-display";
import { useRootStore } from "@/core/stores/root-store.provider";

import { MessageItem } from "./message-item";
import { MessagesScrollContainer } from "./messages-scroll-container";
import { ThreadAutoMarkRead } from "./thread-auto-mark-read";
import { ThreadSettings } from "./thread-settings";
import { ThreadHeader } from "./thread-header";
import { ThreadReplyComposer } from "./thread-reply-composer";
import { ThreadStatePicker } from "./thread-state-picker";

type Props = {
  threadDetail: ThreadDetail | null;
};

function collectReplyRecipients(thread: MessagingThread, messages: MessagingMessageDto[]): string[] {
  const recipients = new Set<string>();
  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound");
  if (lastInbound) {
    for (const r of lastInbound.recipients.to) if (r.identifier) recipients.add(r.identifier);
    if (lastInbound.sender.identifier) recipients.add(lastInbound.sender.identifier);
  }
  for (const p of thread.participants) if (p.identifier) recipients.add(p.identifier);
  return Array.from(recipients);
}

export const ThreadPanel = observer(({ threadDetail }: Props) => {
  const t = useTranslations();
  const { messagingThreadDetailStore: store, userStore } = useRootStore();
  const canUpdate = userStore.can(Resource.inboxMessages, Action.update);

  useEffect(() => {
    if (store.thread?.id !== threadDetail?.thread.id) store.hydrate(threadDetail);
  }, [threadDetail, store]);

  const thread = store.thread;

  if (!thread) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Inbox className="size-10 opacity-40" />

        <p className="text-sm">{t("Inbox.selectThread")}</p>
      </div>
    );
  }

  const { messages, accountOwners } = store;

  const view = deriveThreadDisplay(thread, t);
  const headerTitle = view.displayName;
  const headerSubtitle = view.isSelfChat ? null : view.displayNameSecondary;
  const headerPictureUrl = view.avatarUrl ?? null;
  const headerUnlinked = view.isUnlinked;

  const avatarByIdentifier = new Map<string, string>();
  for (const p of thread.participants) {
    const url = p.contact?.avatarUrl ?? p.pictureUrl;
    if (p.identifier && url) avatarByIdentifier.set(p.identifier, url);
  }

  return (
    <div className="flex h-full flex-col">
      <ThreadAutoMarkRead state={thread.state} threadId={thread.id} />

      <ThreadHeader
        pictureUrl={headerPictureUrl}
        provider={thread.provider}
        rightSlot={
          <>
            {canUpdate && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="size-[26px]"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => void store.resyncThread()}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                </TooltipTrigger>

                <TooltipContent>{t("Inbox.resyncThread")}</TooltipContent>
              </Tooltip>
            )}

            <ThreadSettings
              accountShared={thread.accountShared}
              isOwner={thread.isOwner}
              participants={thread.participants}
              provider={thread.provider}
              sharedToCrm={thread.sharedToCrm}
              threadId={thread.id}
            />

            <ThreadStatePicker state={thread.state} />
          </>
        }
        subtitle={headerSubtitle}
        title={headerTitle}
        unlinked={headerUnlinked}
      />

      <MessagesScrollContainer scrollKey={`thread:${thread.id}:${messages.length}`}>
        <div className="flex flex-col gap-1">
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              accountOwner={accountOwners[message.connectedAccountId] ?? null}
              message={message}
              senderAvatarUrl={
                message.sender.identifier ? avatarByIdentifier.get(message.sender.identifier) : undefined
              }
            />
          ))}
        </div>
      </MessagesScrollContainer>

      <ThreadReplyComposer
        defaultRecipients={collectReplyRecipients(thread, messages)}
        defaultSubject={thread.subject}
        provider={thread.provider}
        threadId={thread.id}
      />
    </div>
  );
});
