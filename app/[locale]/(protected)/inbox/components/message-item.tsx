"use client";

import type { AccountOwnerDto } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ImageOff, Pencil, Send, Trash2 } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isEmailProvider } from "@/ee/messaging/provider";
import { isPlainTextEmailBody, splitQuotedText } from "@/ee/messaging/email-quote";
import { deriveMessageSender, displayableIdentifier, isUnipileUnsupportedBody } from "@/ee/messaging/thread-display";
import { cn } from "@/core/utils/cn";
import { useRootStore } from "@/core/stores/root-store.provider";

import { attachmentSubtitle, classifyAttachment, describeFile, downloadLocalFile } from "./attachment-classify";
import { AttachmentRow } from "./attachment-row";
import { EmailFrame } from "./email-frame";
import { MessageAttachment } from "./message-attachment";
import { MessageText } from "./message-text";
import { SanitizedHtml } from "./sanitized-html";

type Props = {
  message: MessagingMessageDto;
  accountOwner: AccountOwnerDto | null;
  senderAvatarUrl?: string | null;
  isMine: boolean;
};

function hasLoadableRemoteImages(html: string): boolean {
  if (!html) return false;
  if (/url\(\s*["']?https?:/i.test(html)) return true;

  return (html.match(/<img\b[^>]*>/gi) ?? []).some((tag) => {
    if (!/\bsrc\s*=\s*["']https?:/i.test(tag)) return false;

    const width = tag.match(/\bwidth\s*=\s*["']?(\d+)/i);
    const height = tag.match(/\bheight\s*=\s*["']?(\d+)/i);
    const tiny =
      (width ? Number(width[1]) <= 2 : false) ||
      (height ? Number(height[1]) <= 2 : false) ||
      /(?:width|height)\s*:\s*[012](?:px)?\b/i.test(tag);
    const hidden = /display\s*:\s*none|visibility\s*:\s*hidden/i.test(tag);

    return !tiny && !hidden;
  });
}

function TextWithQuote({ visible, quoted, onPaper }: { visible: string; quoted: string | null; onPaper?: boolean }) {
  const t = useTranslations();
  const [showQuoted, setShowQuoted] = useState(false);

  return (
    <>
      <MessageText text={visible} />

      {quoted && (
        <>
          <button
            className={cn(
              "mt-1 text-xs underline underline-offset-2",
              onPaper ? "text-neutral-500 hover:text-neutral-800" : "text-muted-foreground hover:text-foreground",
            )}
            type="button"
            onClick={() => setShowQuoted((prev) => !prev)}
          >
            {showQuoted ? t("Inbox.hideQuotedText") : t("Inbox.showQuotedText")}
          </button>

          {showQuoted && (
            <div
              className={cn(
                "mt-1 border-l-2 pl-2",
                onPaper ? "border-neutral-300 text-neutral-500" : "border-border/60 text-muted-foreground",
              )}
            >
              <MessageText text={quoted} />
            </div>
          )}
        </>
      )}
    </>
  );
}

export const MessageItem = observer(({ message, accountOwner, senderAvatarUrl, isMine }: Props) => {
  const t = useTranslations();
  const {
    intlStore,
    messagingThreadDetailStore: detail,
    threadComposeStore: compose,
    threadParticipantsStore,
  } = useRootStore();
  const [showRemoteImages, setShowRemoteImages] = useState(false);

  const isOutbound = message.direction === "outbound";
  const isDeleted = message.isDeleted;
  const isEdited = Boolean(message.editedAt) && !isDeleted;
  const isDraft = message.isDraft;
  const status = detail.messageStatus[message.id];
  const isSending = status === "sending";
  const isFailed = status === "failed";
  const pendingFiles = isDraft ? compose.draftAttachments : (compose.pendingAttachments[message.id] ?? []);

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

  const sender = deriveMessageSender(message, accountOwner, senderAvatarUrl, isMine, t);
  const resolvedName = sender.resolvedName;
  const avatarName = sender.avatarName;
  const pictureUrl = sender.avatarUrl;

  const isEmail = isEmailProvider(message.provider) && Boolean(message.bodyHtml);
  const emailPlainBody = isEmail && isPlainTextEmailBody(message.bodyHtml ?? "") ? (message.bodyHtml ?? "") : null;
  const inlineHtml = !isEmail && !isDeleted ? message.bodyHtml : null;
  const isUnsupportedBody = isUnipileUnsupportedBody(message.bodyText);
  const rawDisplayText = isUnsupportedBody ? null : message.bodyText;
  const quoteSource = isEmail ? emailPlainBody : isEmailProvider(message.provider) ? rawDisplayText : null;
  const quoteSplit = quoteSource ? splitQuotedText(quoteSource) : { visible: "", quoted: null };
  const displayText = !isEmail && quoteSource ? quoteSplit.visible : rawDisplayText;
  const chatSubject =
    !isEmail && !isDeleted && message.provider === "linkedin" ? message.subject?.trim() || null : null;

  const reactionTotals = new Map<string, number>();
  for (const r of message.reactions) reactionTotals.set(r.value, (reactionTotals.get(r.value) ?? 0) + 1);

  const hasAttachments = message.attachmentsMeta.length > 0;
  const hasReactions = reactionTotals.size > 0;
  const showUnsupported =
    !hasAttachments &&
    !hasReactions &&
    !inlineHtml &&
    !displayText &&
    !chatSubject &&
    !isEmail &&
    pendingFiles.length === 0;
  const canLoadRemoteImages = isEmail && !showRemoteImages && hasLoadableRemoteImages(message.bodyHtml ?? "");
  const recipientRows = (
    [
      ["Inbox.compose.toLabel", message.recipients.to],
      ["Inbox.compose.ccLabel", message.recipients.cc],
      ["Inbox.compose.bccLabel", message.recipients.bcc],
    ] as const
  ).filter(([, list]) => list.length > 0);
  const fullBleedMedia =
    hasAttachments &&
    message.attachmentsMeta.every((a) => {
      const kind = classifyAttachment(a);
      return kind === "image" || kind === "gif" || kind === "video";
    });

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
      <button
        aria-label={t("Inbox.settings.title")}
        className="focus-visible:ring-ring/50 shrink-0 self-end rounded-lg outline-none focus-visible:ring-[3px]"
        type="button"
        onClick={() => threadParticipantsStore.setOpen(true)}
      >
        <Avatar name={avatarName} size="lg" src={pictureUrl} title={avatarTooltip} />
      </button>

      <div
        className={cn(
          "flex min-w-0 max-w-[80%] flex-col gap-1",
          isEmail && "w-full",
          isOutbound ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "bg-card flex flex-col overflow-hidden rounded-xl text-sm shadow-xs",
            isOutbound ? "rounded-br-md" : "rounded-bl-md",
            isEmail ? "w-full" : "w-fit max-w-full",
            isDraft && "border-primary/30 border border-dashed",
            isSending && "opacity-60",
            isFailed && "ring-destructive/50 ring-1",
          )}
        >
          {isDeleted ? (
            <div className="text-muted-foreground px-3.5 py-2 italic">{t("Inbox.messageDeleted")}</div>
          ) : isEmail ? (
            <>
              {recipientRows.length > 0 && (
                <div className="border-border/60 text-muted-foreground flex flex-col gap-1 border-b px-3.5 py-2 text-xs">
                  {recipientRows.map(([labelKey, list]) => (
                    <div key={labelKey} className="flex flex-wrap items-center gap-1">
                      <span className="font-medium">{t(labelKey)}:</span>

                      {list.map((r, index) => {
                        const label = r.identifier?.trim() || r.displayName;
                        if (!label) return null;

                        return <AppChip key={`${labelKey}:${label}:${index}`}>{label}</AppChip>;
                      })}
                    </div>
                  ))}
                </div>
              )}

              {emailPlainBody ? (
                <div className="bg-white px-4 py-3 leading-normal text-neutral-900 wrap-anywhere">
                  <TextWithQuote quoted={quoteSplit.quoted} visible={quoteSplit.visible} onPaper />
                </div>
              ) : (
                <EmailFrame html={message.bodyHtml ?? ""} showRemoteImages={showRemoteImages} />
              )}
            </>
          ) : showUnsupported ? (
            <div className="text-muted-foreground px-3.5 py-2 italic">{t("Inbox.attachmentUnsupported")}</div>
          ) : inlineHtml || displayText || chatSubject ? (
            <div className={cn("px-3.5 pt-2 pb-1 leading-relaxed wrap-anywhere", fullBleedMedia && "w-min min-w-full")}>
              {chatSubject && <div className="pb-0.5 font-medium">{chatSubject}</div>}

              {inlineHtml ? (
                <SanitizedHtml className="prose-sm max-w-none wrap-anywhere [&_a]:underline" html={inlineHtml} />
              ) : displayText ? (
                <TextWithQuote quoted={quoteSplit.quoted} visible={displayText} />
              ) : null}
            </div>
          ) : null}

          {!isDeleted && hasAttachments && (
            <div className={cn("flex flex-col gap-1.5", !fullBleedMedia && "p-1.5")}>
              {message.attachmentsMeta.map((att) => (
                <MessageAttachment key={att.id} att={att} messageId={message.id} t={t} />
              ))}
            </div>
          )}

          {pendingFiles.length > 0 && (
            <div className="flex flex-col gap-1.5 p-1.5">
              {pendingFiles.map((file, fileIndex) => {
                const { Icon: FileTypeIcon, accent } = describeFile({
                  mime: file.type,
                  fileName: file.name,
                });
                return (
                  <AttachmentRow
                    key={`${file.name}-${fileIndex}`}
                    accent={accent}
                    fileIcon={FileTypeIcon}
                    name={file.name}
                    subtitle={attachmentSubtitle(t, {
                      mime: file.type,
                      fileName: file.name,
                      size: file.size,
                    })}
                    onOpen={() => downloadLocalFile(file)}
                  />
                );
              })}
            </div>
          )}

          {(isDraft || isFailed || canLoadRemoteImages) && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
              {isDraft ? (
                <span className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={t("Inbox.compose.draftEdit")}
                        size="icon-xs"
                        type="button"
                        variant="secondary"
                        onClick={() => compose.loadDraft(message)}
                      >
                        <Pencil />
                      </Button>
                    </TooltipTrigger>

                    <TooltipContent>{t("Inbox.compose.draftEdit")}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={t("Inbox.compose.draftDiscard")}
                        size="icon-xs"
                        type="button"
                        variant="softDestructive"
                        onClick={() => void compose.discardDraft(message.id)}
                      >
                        <Trash2 />
                      </Button>
                    </TooltipTrigger>

                    <TooltipContent>{t("Inbox.compose.draftDiscard")}</TooltipContent>
                  </Tooltip>

                  <Button
                    size="xs"
                    type="button"
                    onClick={() => {
                      compose.loadDraft(message);
                      void compose.send();
                    }}
                  >
                    <Send />

                    {t("Inbox.compose.draftSendNow")}
                  </Button>
                </span>
              ) : isFailed ? (
                <Button size="xs" type="button" variant="secondary" onClick={() => void compose.retrySend(message.id)}>
                  {t("Inbox.compose.retry")}
                </Button>
              ) : canLoadRemoteImages ? (
                <Button size="xs" type="button" variant="secondary" onClick={() => setShowRemoteImages(true)}>
                  <ImageOff className="size-3" />

                  {t("Inbox.compose.loadRemoteImages")}
                </Button>
              ) : null}
            </div>
          )}
        </div>

        {!isDraft && (
          <div className="flex items-center gap-1.5 px-1">
            {!isOutbound && (
              <span className="text-foreground/80 max-w-48 truncate text-xs font-medium">{resolvedName}</span>
            )}

            <span className="text-muted-foreground text-[11px] whitespace-nowrap">
              {intlStore.formatTime(message.sentAt)}
            </span>

            {isEdited && <span className="text-muted-foreground/70 text-[10px] italic">{t("Inbox.edited")}</span>}

            {hasReactions && !isDeleted && (
              <span className="flex items-center gap-1">
                {Array.from(reactionTotals.entries()).map(([reaction, count]) => (
                  <span
                    key={reaction}
                    className="bg-muted text-foreground/80 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs leading-none"
                  >
                    {reaction}

                    {count > 1 && <span className="text-muted-foreground text-[10px] font-medium">{count}</span>}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
