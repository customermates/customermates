"use client";

import type { MessagingThreadState } from "@/ee/messaging/messaging.schema";
import type { MessagingThread } from "@/ee/messaging/messaging.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { EyeOff } from "lucide-react";

import { getProviderIcon } from "@/ee/messaging/provider-icon";
import {
  groupThreadName,
  isGroupThread,
  isUnipileUnsupportedBody,
  threadHasUnlinkedAttendee,
} from "@/ee/messaging/thread-display";
import { participantLabel } from "./thread-participants-contacts";
import { THREAD_STATE_DOT } from "./thread-state-visuals";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  thread: MessagingThread;
  selected: boolean;
  onClick: () => void;
};

const ROW_BADGE_STATES: MessagingThreadState[] = ["unread", "closed", "spam"];

export const ThreadRow = observer(({ thread, selected, onClick }: Props) => {
  const t = useTranslations();
  const { intlStore } = useRootStore();
  const isUnread = thread.state === "unread";
  const isGroup = isGroupThread(thread);
  const showStateBadge = ROW_BADGE_STATES.includes(thread.state);

  const counterpart = thread.participants.find((p) => !p.isSelf) ?? thread.participants[0];

  const rawPreview = thread.subject?.trim() || thread.preview?.trim() || null;
  const isUnsupported = isUnipileUnsupportedBody(rawPreview);
  const previewText = rawPreview && !isUnsupported ? rawPreview : null;
  const placeholder = isUnsupported ? t("Inbox.attachmentUnsupported") : t("Inbox.noPreview");
  const groupName = isGroup ? groupThreadName(thread, t) : null;
  const isSelfChat = !isGroup && !counterpart;
  const isUnlinked = !isSelfChat && threadHasUnlinkedAttendee(thread.participants);
  const fallbackName = isSelfChat
    ? t("Inbox.senderYou")
    : thread.provider === "linkedin"
      ? t("Inbox.linkedinContact")
      : t("Inbox.senderUnknown");
  const displaySender =
    groupName || (counterpart ? participantLabel(counterpart, thread.provider, fallbackName) : fallbackName);
  const pictureUrl = isGroup ? undefined : (counterpart?.contact?.avatarUrl ?? counterpart?.pictureUrl ?? undefined);

  const relativeTime = thread.lastMessageAt ? intlStore.formatRelativeTime(thread.lastMessageAt) : null;
  const ProviderIcon = getProviderIcon(thread.provider);

  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 border-b border-border p-3 text-left transition",
        "hover:bg-muted/50",
        selected && "bg-muted",
      )}
      type="button"
      onClick={onClick}
    >
      <div className="relative shrink-0">
        <Avatar
          name={displaySender}
          size="lg"
          src={pictureUrl}
          unlinked={isUnlinked}
          unlinkedLabel={isUnlinked ? t("Inbox.unlinkedParticipants") : undefined}
        />

        {showStateBadge && (
          <span
            aria-label={t(`Inbox.threadStates.${thread.state}`)}
            className={cn(
              "absolute top-0 right-0 size-2 rounded-full ring-2 ring-background",
              THREAD_STATE_DOT[thread.state],
            )}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={cn("truncate text-sm", isUnread ? "font-semibold" : "font-medium")}>{displaySender}</span>

            <Tooltip>
              <TooltipTrigger asChild>
                <ProviderIcon
                  aria-label={t(`Common.providers.${thread.provider}`)}
                  className="text-muted-foreground size-3 shrink-0"
                />
              </TooltipTrigger>

              <TooltipContent>{t(`Common.providers.${thread.provider}`)}</TooltipContent>
            </Tooltip>

            {!thread.accountShared && !thread.sharedToCrm && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <EyeOff aria-label={t("Inbox.shareToCrmPrivate")} className="text-muted-foreground size-3 shrink-0" />
                </TooltipTrigger>

                <TooltipContent>{t("Inbox.shareToCrmPrivate")}</TooltipContent>
              </Tooltip>
            )}
          </div>

          {relativeTime && (
            <time className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">{relativeTime}</time>
          )}
        </div>

        <p className={cn("text-muted-foreground mt-0.5 line-clamp-2 text-xs", !previewText && "italic opacity-80")}>
          {isGroup && previewText && (thread.lastMessageFromSelf || thread.lastMessageSenderName) && (
            <span className="font-semibold">
              {thread.lastMessageFromSelf ? t("Inbox.youPrefix") : `${thread.lastMessageSenderName}:`}{" "}
            </span>
          )}

          {previewText ?? placeholder}
        </p>
      </div>
    </button>
  );
});
