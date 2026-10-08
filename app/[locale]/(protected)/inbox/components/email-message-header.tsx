"use client";

import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { EmailFolder } from "@/ee/messaging/email-folders";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChevronDown, ImageOff, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

import { CopyableAddress } from "./copyable-address";
import { MessageFolderMenu } from "./message-folder-menu";

type Props = {
  message: MessagingMessageDto;
  senderName: string;
  folders: EmailFolder[];
  moving?: boolean;
  onMove?: (folderId: string) => void;
  onLoadRemoteImages?: () => void;
};

export const EmailMessageHeader = observer(
  ({ message, senderName, folders, moving, onMove, onLoadRemoteImages }: Props) => {
    const t = useTranslations();
    const intlStore = useHydratedIntlStore();
    const [detailsOpen, setDetailsOpen] = useState(false);
    const recipientRows = (
      [
        ["Inbox.compose.toLabel", message.recipients.to],
        ["Inbox.compose.ccLabel", message.recipients.cc],
        ["Inbox.compose.bccLabel", message.direction === "outbound" ? message.recipients.bcc : []],
      ] as const
    )
      .map(
        ([labelKey, recipients]) =>
          [t(labelKey), recipients.filter((person) => person.identifier.trim() || person.displayName?.trim())] as const,
      )
      .filter(([, recipients]) => recipients.length > 0);
    const senderAddress = message.sender.identifier.trim();
    const primaryRow = recipientRows[0];
    const primaryRecipient = primaryRow?.[1][0];
    const firstRow = detailsOpen && senderAddress ? ([t("Inbox.compose.from"), [message.sender]] as const) : primaryRow;
    const firstRecipients = detailsOpen ? firstRow?.[1] : primaryRecipient ? [primaryRecipient] : [];
    const remainingRows = senderAddress ? recipientRows : recipientRows.slice(1);
    const additionalRecipients = Math.max(0, recipientRows.reduce((count, [, list]) => count + list.length, 0) - 1);

    return (
      <div
        data-email-header
        aria-label={t("Inbox.messageDetails")}
        className="text-muted-foreground flex min-w-0 flex-col gap-1 px-3.5 pt-2.5 text-xs"
        role="group"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {senderAddress ? (
                <CopyableAddress
                  className="text-foreground text-xs font-medium"
                  label={senderName}
                  value={senderAddress}
                />
              ) : (
                <span className="text-foreground truncate text-xs font-medium">{senderName}</span>
              )}

              {message.editedAt && !message.isDeleted && (
                <span className="text-muted-foreground shrink-0 text-xs italic">{t("Inbox.edited")}</span>
              )}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <time
                  className="text-muted-foreground shrink-0 text-xs whitespace-nowrap"
                  dateTime={new Date(message.sentAt).toISOString()}
                >
                  {intlStore.formatTime(message.sentAt)}
                </time>
              </TooltipTrigger>

              <TooltipContent>{intlStore.formatNumericalShortDateTime(message.sentAt)}</TooltipContent>
            </Tooltip>

            {!message.isDeleted && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t("Inbox.emailActions")}
                    className="text-muted-foreground"
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDetailsOpen((open) => !open)}>
                    {t("Inbox.messageDetails")}
                  </DropdownMenuItem>

                  {onLoadRemoteImages && (
                    <DropdownMenuItem onSelect={onLoadRemoteImages}>
                      <ImageOff />

                      {t("Inbox.compose.loadRemoteImages")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {!message.isDeleted && (
          <Collapsible
            className="grid grid-cols-[max-content_minmax(0,1fr)_auto] gap-x-1"
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
          >
            <div className="col-span-3 grid min-w-0 grid-cols-subgrid items-start">
              <div className="col-span-2 grid min-w-0 grid-cols-subgrid items-start py-1">
                {firstRow && firstRecipients && firstRecipients.length > 0 && (
                  <>
                    <span className="whitespace-nowrap">{firstRow[0]}:</span>

                    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                      {firstRecipients.map((person, index) =>
                        person.identifier.trim() ? (
                          <CopyableAddress
                            key={person.attendeeId || `${person.identifier}:${index}`}
                            value={person.identifier}
                          />
                        ) : (
                          <span key={person.attendeeId || index} className="min-w-0 break-words">
                            {person.displayName}
                          </span>
                        ),
                      )}
                    </div>
                  </>
                )}
              </div>

              <CollapsibleTrigger asChild>
                <Button
                  aria-label={t("Inbox.messageDetails")}
                  className="text-muted-foreground ml-auto shrink-0 gap-1 px-0 font-normal has-[>svg]:px-0 data-[state=open]:[&_svg]:rotate-180"
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  {t("Common.details")}

                  {!detailsOpen && additionalRecipients > 0 && (
                    <span>+{intlStore.formatNumber(additionalRecipients)}</span>
                  )}

                  <ChevronDown className="size-3" />
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="col-span-3 grid grid-cols-subgrid">
              {remainingRows.map(([label, list]) => (
                <div key={label} className="col-span-3 grid min-w-0 grid-cols-subgrid items-start py-1">
                  <span className="whitespace-nowrap">{label}:</span>

                  <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                    {list.map((person, index) =>
                      person.identifier.trim() ? (
                        <CopyableAddress
                          key={person.attendeeId || `${person.identifier}:${index}`}
                          value={person.identifier}
                        />
                      ) : (
                        <span key={person.attendeeId || index} className="min-w-0 break-words">
                          {person.displayName}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <MessageFolderMenu folders={folders} message={message} moving={moving} onMove={onMove} />

          {onLoadRemoteImages && (
            <Button
              className="text-muted-foreground ml-auto px-0 font-normal has-[>svg]:px-0"
              size="xs"
              type="button"
              variant="ghost"
              onClick={onLoadRemoteImages}
            >
              <ImageOff className="size-3" />

              {t("Inbox.compose.loadRemoteImages")}
            </Button>
          )}
        </div>
      </div>
    );
  },
);
