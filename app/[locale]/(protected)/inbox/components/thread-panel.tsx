"use client";

import { Inbox, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Fragment, useEffect } from "react";

import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";
import type { ThreadDetail } from "./messaging-thread-detail.store";

import { useRootStore } from "@/core/stores/root-store.provider";

import { MessageItem } from "./message-item";
import { MessageDateSeparator, isSameDay } from "./message-date-separator";
import { MessagesScrollContainer } from "./messages-scroll-container";
import { ThreadAutoMarkRead } from "./thread-auto-mark-read";
import { ThreadTopBar } from "./thread-topbar";
import { ThreadReplyComposer } from "./thread-reply-composer";

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
  const { messagingThreadDetailStore: store } = useRootStore();

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

  const avatarByIdentifier = new Map<string, string>();
  for (const p of thread.participants) {
    const url = p.contact?.avatarUrl ?? p.pictureUrl;
    if (p.identifier && url) avatarByIdentifier.set(p.identifier, url);
  }

  return (
    <div className="flex h-full flex-col">
      <ThreadAutoMarkRead state={thread.state} threadId={thread.id} />

      <ThreadTopBar thread={thread} />

      <MessagesScrollContainer scrollKey={`thread:${thread.id}`} onTopReach={store.loadOlderMessages}>
        <div className="flex flex-col gap-1">
          {store.loadingOlder && (
            <div className="flex justify-center py-2">
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
            </div>
          )}

          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const showDate = !previous || !isSameDay(new Date(previous.sentAt), new Date(message.sentAt));

            return (
              <Fragment key={message.id}>
                {showDate && <MessageDateSeparator date={new Date(message.sentAt)} />}

                <MessageItem
                  accountOwner={accountOwners[message.connectedAccountId] ?? null}
                  isMine={thread.isOwner}
                  message={message}
                  senderAvatarUrl={
                    message.sender.identifier ? avatarByIdentifier.get(message.sender.identifier) : undefined
                  }
                />
              </Fragment>
            );
          })}
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
