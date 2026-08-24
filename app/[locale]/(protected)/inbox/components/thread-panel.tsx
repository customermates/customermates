"use client";

import { Loader2, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { useLayoutEffect, type ReactNode } from "react";

import type { ThreadDetail } from "./messaging-thread-detail.store";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";

import { useRootStore } from "@/core/stores/root-store.provider";
import { deriveReplyRecipients } from "@/ee/messaging/reply-recipients";
import { PageState } from "@/components/page-state/page-state";

import { InboxPageSkeleton } from "./inbox-page-skeleton";
import { MessageItem } from "./message-item";
import { MessageDateSeparator, isSameDay } from "./message-date-separator";
import { MessagesScrollContainer } from "@/components/scroll/messages-scroll-container";
import { ThreadAutoMarkRead } from "./thread-auto-mark-read";
import { ThreadTopBar } from "./thread-topbar";
import { ThreadReplyComposer } from "./thread-reply-composer";

type Props = {
  threadDetail: ThreadDetail | null;
  locked?: boolean;
};

type ThreadPanelPageState =
  | { status: "locked" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "content"; thread: MessagingThread };

type MessageDayGroup<T> = { key: string; date: Date; messages: T[] };

export function groupMessagesByDay<T extends { id: string; sentAt: Date | string }>(
  messages: readonly T[],
): MessageDayGroup<T>[] {
  const groups: MessageDayGroup<T>[] = [];

  for (const message of messages) {
    const date = new Date(message.sentAt);
    const currentGroup = groups.at(-1);

    if (currentGroup && isSameDay(currentGroup.date, date)) {
      currentGroup.messages.push(message);
      continue;
    }

    groups.push({ key: message.id, date, messages: [message] });
  }

  return groups;
}

export function resolveThreadPanelPageState({
  locked,
  requestedThreadId,
  thread,
}: {
  locked: boolean;
  requestedThreadId: string | null;
  thread: MessagingThread | null;
}): ThreadPanelPageState {
  if (locked) return { status: "locked" };
  if (!requestedThreadId) return { status: "empty" };
  if (thread?.id !== requestedThreadId) return { status: "loading" };
  return { status: "content", thread };
}

export const ThreadPanel = observer(({ threadDetail, locked = false }: Props) => {
  const t = useTranslations();
  const { messagingThreadDetailStore: store } = useRootStore();

  useLayoutEffect(() => {
    if (store.thread?.id !== threadDetail?.thread.id) store.hydrate(threadDetail);
  }, [threadDetail, store]);

  const requestedThreadId = threadDetail?.thread.id ?? null;
  const pageState = resolveThreadPanelPageState({ locked, requestedThreadId, thread: store.thread });

  let body: ReactNode;
  switch (pageState.status) {
    case "locked":
      body = <InboxPageSkeleton animated={false} view="transcript" />;
      break;
    case "loading":
      body = (
        <PageState
          background={<InboxPageSkeleton view="transcript" />}
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "empty":
      body = (
        <PageState
          background={<InboxPageSkeleton animated={false} view="transcript" />}
          className="h-full"
          icon={MessageSquare}
          state="empty"
          title={t("Inbox.selectThread")}
        />
      );
      break;
    case "content": {
      const { thread } = pageState;
      const { messages, accountOwners } = store;
      const replyRecipients = deriveReplyRecipients(thread.participants, messages);
      const avatarByIdentifier = new Map<string, string>();
      for (const participant of thread.participants) {
        const url = participant.contact?.avatarUrl ?? participant.pictureUrl;
        if (participant.identifier && url) avatarByIdentifier.set(participant.identifier, url);
      }

      body = (
        <div className="animate-page-result-in flex h-full flex-col motion-reduce:animate-none">
          <ThreadAutoMarkRead state={thread.state} threadId={thread.id} />

          <ThreadTopBar thread={thread} />

          <MessagesScrollContainer scrollKey={`thread:${thread.id}`} onTopReach={store.loadOlderMessages}>
            <div className="flex flex-col gap-1">
              {store.loadingOlder ? (
                <div className="flex justify-center py-2">
                  <Loader2 className="text-muted-foreground size-4 animate-spin" />
                </div>
              ) : null}

              {groupMessagesByDay(messages).map((group) => (
                <section key={group.key} className="flex flex-col gap-1">
                  <MessageDateSeparator date={group.date} />

                  {group.messages.map((message) => (
                    <MessageItem
                      key={message.id}
                      accountOwner={accountOwners[message.connectedAccountId] ?? null}
                      isMine={thread.isOwner}
                      message={message}
                      senderAvatarUrl={
                        message.sender.identifier ? avatarByIdentifier.get(message.sender.identifier) : undefined
                      }
                    />
                  ))}
                </section>
              ))}
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
      break;
    }
    default: {
      const exhaustive: never = pageState;
      body = exhaustive;
    }
  }

  return body;
});
