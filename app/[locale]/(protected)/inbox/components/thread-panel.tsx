"use client";

import { Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";

import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { MessagingAttendee, MessagingThread } from "@/ee/messaging/messaging.schema";
import type { ThreadDetail } from "./messaging-thread-detail.store";

import {
  contactFullName,
  displayableIdentifier,
  groupThreadName,
  isGroupThread,
  messageSenderName,
  threadHasUnlinkedAttendee,
} from "@/ee/messaging/thread-display";
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

type InboxT = (key: string, values?: Record<string, string | number>) => string;

function primaryParticipant(thread: MessagingThread): MessagingAttendee | null {
  return thread.participants.find((p) => p.displayName?.trim() || p.identifier) ?? null;
}

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

function fallbackTitle(thread: MessagingThread, messages: MessagingMessageDto[], t: InboxT): string {
  const subject = thread.subject?.trim();
  if (subject) return subject;

  const inboundParticipant = primaryParticipant(thread);
  if (inboundParticipant) {
    return (
      inboundParticipant.displayName?.trim() ||
      displayableIdentifier(thread.provider, inboundParticipant.identifier) ||
      t("Inbox.senderUnknown")
    );
  }

  const unknownLabel = t("Inbox.senderUnknown");
  const firstInboundMessage = messages.find((m) => m.direction === "inbound");
  const inboundLabel = firstInboundMessage ? messageSenderName(firstInboundMessage) || unknownLabel : "";
  if (inboundLabel && inboundLabel !== unknownLabel) return inboundLabel;

  if (thread.provider === "linkedin") return t("Inbox.linkedinConversation");
  return t("Inbox.conversation");
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

  const primary = primaryParticipant(thread);
  const isGroup = isGroupThread(thread);
  const isSelfChat = !isGroup && !primary;
  const primaryContact = primary?.contact ?? null;
  const linkedContactName = contactFullName(primaryContact) || null;
  const primaryDisplayName = primary?.displayName?.trim() || null;
  const titleFromName = linkedContactName ?? primaryDisplayName;
  const identifierDisplay = displayableIdentifier(thread.provider, primary?.identifier);

  const headerTitle = isGroup
    ? groupThreadName(thread, t)
    : isSelfChat
      ? t("Inbox.senderYou")
      : (titleFromName ?? identifierDisplay ?? fallbackTitle(thread, messages, t));
  const headerSubtitle = isGroup
    ? null
    : titleFromName
      ? identifierDisplay
      : primary?.occupation?.trim() || primary?.headline?.trim() || null;
  const headerPictureUrl = isGroup ? null : (primaryContact?.avatarUrl ?? primary?.pictureUrl ?? null);
  const headerUnlinked = !isSelfChat && threadHasUnlinkedAttendee(thread.participants);

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
