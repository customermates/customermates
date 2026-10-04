"use client";

import type { AccountOwnerDto } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Pencil, Send, Trash2 } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isEmailProvider } from "@/ee/messaging/provider";
import { deriveMessageSender, displayableIdentifier } from "@/ee/messaging/thread-display";
import { cn } from "@/core/utils/cn";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";
import { defaultEmailSettings } from "@/ee/messaging/email-settings";
import { composeEmailBodies } from "@/ee/messaging/outbound/email-signature";

import { attachmentSubtitle, classifyAttachment, describeFile, downloadLocalFile } from "./attachment-classify";
import { AttachmentRow } from "./attachment-row";
import { MessageAttachment } from "./message-attachment";
import { EmailMessageHeader } from "./email-message-header";
import { hasLoadableRemoteImages, MessageBody } from "@/features/messaging/message-body";
import { MessageSurface } from "@/features/messaging/message-surface";

type Props = {
  message: MessagingMessageDto;
  accountOwner: AccountOwnerDto | null;
  senderAvatarUrl?: string | null;
  isMine: boolean;
};

export const MessageItem = observer(({ message, accountOwner, senderAvatarUrl, isMine }: Props) => {
  const t = useTranslations();
  const {
    messagingThreadDetailStore: detail,
    threadComposeStore: compose,
    threadParticipantsStore,
    connectedAccountsStore,
    userStore,
  } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const [showRemoteImages, setShowRemoteImages] = useState(false);

  const isOutbound = message.direction === "outbound";
  const isDeleted = message.isDeleted;
  const isEdited = Boolean(message.editedAt) && !isDeleted;
  const isDraft = message.isDraft;
  const status = compose.getDeliveryStatus(message.id) ?? detail.messageStatus[message.id];
  const isSending = status === "sending";
  const isFailed = status === "failed";
  const pendingFiles = isDraft ? compose.draftAttachments : (compose.pendingAttachments[message.id] ?? []);

  if (message.isEvent) {
    return (
      <div className="flex justify-center px-4 py-2">
        <div className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-[11px] italic">
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

  const providerIsEmail = isEmailProvider(message.provider);
  const account = connectedAccountsStore.items.find((item) => item.id === message.connectedAccountId);
  const renderedEmailHtml =
    providerIsEmail && isDraft
      ? composeEmailBodies(
          message.bodyText ?? "",
          account?.signature,
          account?.emailSettings ?? defaultEmailSettings(),
          "markdown",
        ).html
      : (message.bodyHtml ?? "");
  const isEmail = providerIsEmail;

  const reactionTotals = new Map<string, number>();
  for (const r of message.reactions) reactionTotals.set(r.value, (reactionTotals.get(r.value) ?? 0) + 1);

  const hasAttachments = message.attachmentsMeta.length > 0;
  const hasReactions = reactionTotals.size > 0;
  const canLoadRemoteImages = isEmail && !isDeleted && !showRemoteImages && hasLoadableRemoteImages(renderedEmailHtml);
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
        <MessageSurface
          className={cn(
            isDraft && !isEmail && "border-primary/30 border border-dashed",
            isSending && "opacity-60",
            isFailed && "ring-destructive/50 ring-1",
          )}
          isEmail={isEmail}
          isOutbound={isOutbound}
        >
          {providerIsEmail && (
            <EmailMessageHeader
              folders={detail.folderContext?.folders ?? []}
              message={message}
              moving={Boolean(detail.thread && detail.movingThreadIds.has(detail.thread.id))}
              senderName={resolvedName}
              onLoadRemoteImages={canLoadRemoteImages ? () => setShowRemoteImages(true) : undefined}
              onMove={
                userStore.can(Resource.inboxMessages, Action.update) && detail.folderContext?.canMove
                  ? (folderId) => runUserAction(() => detail.moveToFolder(folderId, message.id))
                  : undefined
              }
            />
          )}

          <MessageBody
            emailHtml={renderedEmailHtml}
            fullBleedMedia={fullBleedMedia}
            hasSupplementaryContent={hasAttachments || hasReactions || pendingFiles.length > 0}
            message={message}
            showRemoteImages={showRemoteImages}
          />

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
                    subtitle={attachmentSubtitle(
                      t,
                      {
                        mime: file.type,
                        fileName: file.name,
                        size: file.size,
                      },
                      (value, options) => intlStore.formatNumber(value, options),
                    )}
                    onOpen={() => downloadLocalFile(file)}
                  />
                );
              })}
            </div>
          )}

          {(isDraft || isFailed) && (
            <div
              data-message-actions
              className={cn("flex flex-wrap items-center gap-2", isEmail ? "px-3.5 pt-1 pb-3" : "px-3 py-1.5")}
            >
              {isDraft ? (
                <span className={cn("flex items-center gap-1", isEmail && "w-full flex-wrap justify-between gap-3")}>
                  <span className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("Inbox.compose.draftEdit")}
                          className={isEmail ? "text-muted-foreground font-normal" : undefined}
                          size={isEmail ? "xs" : "icon-xs"}
                          type="button"
                          variant={isEmail ? "ghost" : "secondary"}
                          onClick={() => compose.loadDraft(message)}
                        >
                          <Pencil />

                          {isEmail && t("Inbox.compose.draftEdit")}
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent>{t("Inbox.compose.draftEdit")}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label={t("Inbox.compose.draftDiscard")}
                          className={isEmail ? "text-muted-foreground hover:text-destructive" : undefined}
                          disabled={!message.draftRevision}
                          size="icon-xs"
                          type="button"
                          variant={isEmail ? "ghost" : "softDestructive"}
                          onClick={() => {
                            const draftRevision = message.draftRevision;
                            if (!draftRevision) return;
                            runUserAction(() => compose.discardDraft(message.id, draftRevision));
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </TooltipTrigger>

                      <TooltipContent>{t("Inbox.compose.draftDiscard")}</TooltipContent>
                    </Tooltip>
                  </span>

                  <Button
                    className={isEmail ? "ml-auto" : undefined}
                    size="xs"
                    type="button"
                    onClick={() => runUserAction(() => compose.sendDraft(message))}
                  >
                    <Send />

                    {t("Inbox.compose.draftSendNow")}
                  </Button>
                </span>
              ) : isFailed ? (
                <Button
                  size="xs"
                  type="button"
                  variant="secondary"
                  onClick={() => runUserAction(() => compose.retrySend(message.id))}
                >
                  {t("Inbox.compose.retry")}
                </Button>
              ) : null}
            </div>
          )}
        </MessageSurface>

        {!isDraft && (!providerIsEmail || hasReactions) && (
          <div className="flex items-center gap-1.5 px-1">
            {!providerIsEmail && !isOutbound && (
              <span className="text-foreground/80 max-w-48 truncate text-xs font-medium">{resolvedName}</span>
            )}

            {!providerIsEmail && (
              <span className="text-muted-foreground text-[11px] whitespace-nowrap">
                {intlStore.formatTime(message.sentAt)}
              </span>
            )}

            {!providerIsEmail && isEdited && (
              <span className="text-muted-foreground/70 text-[10px] italic">{t("Inbox.edited")}</span>
            )}

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
