"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Fragment, useEffect } from "react";

import type { ThreadDetail } from "./messaging-thread-detail.store";

import { useRootStore } from "@/core/stores/root-store.provider";
import { deriveReplyRecipients } from "@/ee/messaging/reply-recipients";
import { PageState } from "@/components/page-state/page-state";
import { PageSkeleton } from "@/components/page-state/page-skeleton";

import { MessageItem } from "./message-item";
import { MessageDateSeparator, isSameDay } from "./message-date-separator";
import { MessagesScrollContainer } from "./messages-scroll-container";
import { ThreadAutoMarkRead } from "./thread-auto-mark-read";
import { ThreadTopBar } from "./thread-topbar";
import { ThreadReplyComposer } from "./thread-reply-composer";

type Props = {
  threadDetail: ThreadDetail | null;
  locked?: boolean;
};

export const ThreadPanel = observer(({ threadDetail, locked = false }: Props) => {
  const t = useTranslations();
  const { messagingThreadDetailStore: store } = useRootStore();

  useEffect(() => {
    if (store.thread?.id !== threadDetail?.thread.id) store.hydrate(threadDetail);
  }, [threadDetail, store]);

  const thread = store.thread;

  if (locked) return <PageSkeleton animated={false} spec={{ kind: "inbox", view: "transcript" }} />;

  if (!thread) {
    return (
      <PageState
        className="h-full"
        skeleton={{ kind: "inbox", view: "transcript" }}
        state="empty"
        title={t("Inbox.selectThread")}
      />
    );
  }

  const { messages, accountOwners } = store;
  const replyRecipients = deriveReplyRecipients(thread.participants, messages);

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
        defaultCc={replyRecipients.cc}
        defaultRecipients={replyRecipients.to}
        defaultSubject={thread.subject}
        provider={thread.provider}
        threadId={thread.id}
      />
    </div>
  );
});
