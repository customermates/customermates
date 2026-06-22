"use client";

import type { AccountOwnerDto } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { isEmailProvider } from "@/ee/messaging/provider";
import {
  displayableIdentifier,
  isAttendeeUnlinked,
  isUnipileUnsupportedBody,
  messageSenderName,
} from "@/ee/messaging/thread-display";
import { cn } from "@/lib/utils";
import { useRootStore } from "@/core/stores/root-store.provider";

import { classifyAttachment, isMediaKind } from "./attachment-classify";
import { EmailFrame } from "./email-frame";
import { MessageActions } from "./message-actions";
import { MessageAttachment } from "./message-attachment";
import { MessageText } from "./message-text";
import { SanitizedHtml } from "./sanitized-html";

type Props = {
  message: MessagingMessageDto;
  accountOwner: AccountOwnerDto | null;
  senderAvatarUrl?: string | null;
};

export const MessageItem = observer(({ message, accountOwner, senderAvatarUrl }: Props) => {
  const t = useTranslations();
  const { intlStore } = useRootStore();
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [showRemoteImages, setShowRemoteImages] = useState(false);

  const isOutbound = message.direction === "outbound";
  const isDeleted = Boolean(message.deletedAt);
  const isEdited = Boolean(message.editedAt) && !isDeleted;

  if (message.isEvent) {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="bg-muted/60 text-muted-foreground rounded-full px-3 py-1 text-[11px] italic">
          {message.bodyText?.trim() || t("Inbox.systemEvent")}

          <span className="text-muted-foreground/70 ml-2">
            {intlStore.formatNumericalShortDateTime(message.sentAt)}
          </span>
        </div>
      </div>
    );
  }

  const senderName = messageSenderName(message);
  const resolvedName =
    senderName ||
    (isOutbound ? accountOwner?.displayName : null) ||
    (isOutbound ? t("Inbox.senderYou") : t("Inbox.senderUnknown"));
  const pictureUrl =
    message.sender.contact?.avatarUrl ??
    senderAvatarUrl ??
    message.sender.pictureUrl ??
    (isOutbound ? (accountOwner?.avatarUrl ?? undefined) : undefined);

  const isEmail = isEmailProvider(message.provider) && Boolean(message.bodyHtml);
  const inlineHtml = !isEmail && !isDeleted ? message.bodyHtml : null;
  const isUnsupportedBody = isUnipileUnsupportedBody(message.bodyText);
  const displayText = isUnsupportedBody ? null : message.bodyText;

  const reactionTotals = new Map<string, number>();
  for (const r of message.reactions) reactionTotals.set(r.value, (reactionTotals.get(r.value) ?? 0) + 1);

  const hasAttachments = message.attachmentsMeta.length > 0;
  const hasReactions = reactionTotals.size > 0;
  const showUnsupported = !hasAttachments && !hasReactions && !inlineHtml && !displayText;
  const hasUnloadedMedia =
    !mediaLoaded && message.attachmentsMeta.some((a) => !a.unavailable && isMediaKind(classifyAttachment(a)));

  const tooltipDetail = message.sender.occupation?.trim() || message.sender.headline?.trim() || null;
  const tooltipIdentifier = displayableIdentifier(message.provider, message.sender.identifier);
  const avatarTooltip = [
    resolvedName,
    tooltipDetail,
    tooltipIdentifier && tooltipIdentifier !== resolvedName ? tooltipIdentifier : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className={cn("flex gap-2 px-4 py-2", isOutbound ? "flex-row-reverse" : "flex-row")}>
      <Avatar
        name={resolvedName}
        src={pictureUrl}
        title={avatarTooltip}
        unlinked={!isOutbound && isAttendeeUnlinked(message.sender)}
      />

      <div
        className={cn(
          "flex min-w-0 flex-col gap-1",
          isEmail ? "w-full max-w-[92%]" : "max-w-[78%]",
          isOutbound ? "items-end" : "items-start",
        )}
      >
        <span className="text-muted-foreground text-[11px] whitespace-nowrap">
          {intlStore.formatNumericalShortDateTime(message.sentAt)}
        </span>

        {isDeleted ? (
          <div
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm italic shadow-xs",
              isOutbound
                ? "bg-primary text-primary-foreground/70 rounded-tr-sm"
                : "bg-muted text-muted-foreground rounded-tl-sm",
            )}
          >
            {t("Inbox.messageDeleted")}
          </div>
        ) : isEmail ? (
          <EmailFrame html={message.bodyHtml ?? ""} isOutbound={isOutbound} showRemoteImages={showRemoteImages} />
        ) : showUnsupported ? (
          <MessageAttachment
            att={{ id: `${message.id}:unsupported`, name: null, type: "unsupported" }}
            isOutbound={isOutbound}
            loaded={false}
            messageId={message.id}
            t={t}
          />
        ) : inlineHtml || displayText ? (
          <div
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm leading-relaxed shadow-xs wrap-anywhere",
              isOutbound
                ? "bg-primary text-primary-foreground rounded-tr-sm"
                : "bg-muted text-foreground rounded-tl-sm",
            )}
          >
            {inlineHtml ? (
              <SanitizedHtml className="prose-sm max-w-none wrap-anywhere [&_a]:underline" html={inlineHtml} />
            ) : (
              <MessageText text={displayText ?? ""} />
            )}
          </div>
        ) : null}

        {reactionTotals.size > 0 && !isDeleted && (
          <div
            className={cn(
              "relative z-10 -mt-3 flex flex-wrap gap-0.5 px-2",
              isOutbound ? "justify-end" : "justify-start",
            )}
          >
            {Array.from(reactionTotals.entries()).map(([reaction, count]) => (
              <span
                key={reaction}
                className="bg-background flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full px-1 text-xs leading-none"
              >
                {reaction}

                {count > 1 && <span className="text-muted-foreground text-[10px]">{count}</span>}
              </span>
            ))}
          </div>
        )}

        {isEdited && (
          <span className={cn("text-muted-foreground text-[10px] italic", isOutbound ? "text-right" : "text-left")}>
            {t("Inbox.edited")}
          </span>
        )}

        {!isDeleted && hasAttachments && (
          <div className={cn("flex max-w-full flex-col gap-1.5", isOutbound ? "items-end" : "items-start")}>
            {message.attachmentsMeta.map((att) => (
              <MessageAttachment
                key={att.id}
                att={att}
                isOutbound={isOutbound}
                loaded={mediaLoaded}
                messageId={message.id}
                t={t}
              />
            ))}
          </div>
        )}

        {!isDeleted && (
          <MessageActions
            isOutbound={isOutbound}
            showLoadImages={isEmail && !showRemoteImages}
            showLoadMedia={hasUnloadedMedia}
            t={t}
            onLoadImages={() => setShowRemoteImages(true)}
            onLoadMedia={() => setMediaLoaded(true)}
          />
        )}
      </div>
    </div>
  );
});
