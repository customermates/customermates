"use client";

import type { IdentifierInput } from "@/features/contacts/contact.schema";
import type { ReactNode } from "react";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Copy, ExternalLink, Send, X } from "lucide-react";

import { Action, Resource } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { channelLabelKey, isHandleProvider } from "@/ee/messaging/provider";
import { getChannelIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel, channelUrl } from "@/ee/messaging/thread-display";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

import { AddChannelPopover } from "./add-channel-popover";
import { ContactComposePopover } from "./contact-compose-popover";

type Props = {
  contactId?: string;
  emptyHint?: string;
  headingEndAddon?: ReactNode;
  hideHeading?: boolean;
};

export const ContactChannels = observer(({ contactId, emptyHint, headingEndAddon, hideHeading = false }: Props) => {
  const t = useTranslations();
  const rootStore = useRootStore();
  const { userStore, contactDetailStore, threadComposeStore, connectedAccountsStore } = rootStore;
  const copy = useCopyToClipboard();
  const [composeKey, setComposeKey] = useState<string | null>(null);
  const canEditChannels = userStore.can(Resource.contacts, contactId ? Action.update : Action.create);
  const canStartThread = userStore.can(Resource.inboxMessages, Action.create) && rootStore.appMode !== "self-hosted";
  const identifiers = contactDetailStore.channels;
  const canOpenInbox = Boolean(contactId && identifiers.length > 0 && rootStore.appMode !== "self-hosted");

  useEffect(() => {
    if (canStartThread) void connectedAccountsStore.ensureLoaded().catch(reportApplicationError);
  }, [canStartThread, connectedAccountsStore]);

  async function openCompose(identifier: IdentifierInput, key: string) {
    await connectedAccountsStore.ensureLoaded();
    const [first] = connectedAccountsStore.usableSendersFor(identifier.provider);
    threadComposeStore.initializeNewThread({
      provider: identifier.provider,
      connectedAccountId: first?.id ?? "",
      recipientIdentifier: identifier.messagingId ?? identifier.value,
      recipientDisplayName: identifier.displayName ?? null,
      onDone: () => setComposeKey(null),
    });
    setComposeKey(key);
  }

  return (
    <div className="flex flex-col gap-2">
      {(!hideHeading || headingEndAddon || canOpenInbox) && (
        <div className={cn("flex items-center gap-1.5", hideHeading && "justify-end")}>
          {!hideHeading && (
            <span className="text-muted-foreground text-xs font-normal">{t("EntityChannels.heading")}</span>
          )}

          {headingEndAddon}

          {canOpenInbox && contactId && (
            <IconButton
              href={`/inbox?filters=${encodeURIComponent(`participantContactId:in:${contactId}`)}`}
              icon={ExternalLink}
              label={t("EntityChannels.tooltipOpenInbox")}
            />
          )}
        </div>
      )}

      {contactId && identifiers.length === 0 && !canEditChannels && (
        <p className="text-muted-foreground text-xs italic">{emptyHint ?? t("EntityChannels.emptyHint")}</p>
      )}

      <div className="flex flex-col gap-2">
        {identifiers.map((identifier, index) => {
          const ProviderIcon = getChannelIcon(identifier.provider);
          const providerLabel = t(`Common.providers.${channelLabelKey(identifier.provider)}`);
          const primaryLabel =
            channelDisplayLabel(identifier.provider, identifier.value, identifier.profileUrl) ||
            identifier.displayName ||
            providerLabel;
          const copyValue = channelUrl(identifier.provider, identifier.value, identifier.profileUrl) ?? primaryLabel;
          const isUnverified = isHandleProvider(identifier.provider) && !identifier.messagingId;
          const channelKey = `${identifier.provider}:${identifier.value}`;
          const composing = composeKey === channelKey;

          return (
            <Popover
              key={channelKey}
              open={composing}
              onOpenChange={(next) => {
                if (!next) setComposeKey(null);
              }}
            >
              <PopoverAnchor asChild>
                <div className="border-border bg-card flex items-center gap-3 rounded-md border px-3 py-2">
                  <ProviderIcon className="size-6 shrink-0" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-[11px] font-medium">{providerLabel}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block max-w-[18rem] truncate text-sm font-medium">{primaryLabel}</span>
                        </TooltipTrigger>

                        <TooltipContent className="break-all">{primaryLabel}</TooltipContent>
                      </Tooltip>

                      <IconButton
                        icon={Copy}
                        label={t("EntityChannels.ariaCopy")}
                        onClick={() => runUserAction(() => copy(copyValue))}
                      />
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {isUnverified && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex shrink-0">
                            <AppChip variant="secondary">{t("EntityChannels.unverified")}</AppChip>
                          </span>
                        </TooltipTrigger>

                        <TooltipContent className="max-w-64">{t("EntityChannels.tooltipUnverified")}</TooltipContent>
                      </Tooltip>
                    )}

                    {canStartThread && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-expanded={composing}
                            aria-label={t("EntityChannels.ariaStartThread", {
                              provider: providerLabel,
                            })}
                            className={cn(
                              "text-muted-foreground hover:text-foreground",
                              composing && "bg-accent text-foreground",
                            )}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              if (composing) setComposeKey(null);
                              else runUserAction(() => openCompose(identifier, channelKey));
                            }}
                          >
                            <Send className="size-4" />
                          </Button>
                        </TooltipTrigger>

                        <TooltipContent>{t("EntityChannels.tooltipStartNewThread")}</TooltipContent>
                      </Tooltip>
                    )}

                    {canEditChannels && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={t("EntityChannels.ariaUnlink", {
                              provider: providerLabel,
                            })}
                            className="text-muted-foreground hover:text-destructive"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => contactDetailStore.removeChannel(index)}
                          >
                            <X className="size-4" />
                          </Button>
                        </TooltipTrigger>

                        <TooltipContent>{t("EntityChannels.tooltipUnlinkChannel")}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </PopoverAnchor>

              <PopoverContent
                align="start"
                className="w-(--radix-popover-trigger-width) overflow-hidden p-0"
                onInteractOutside={(event) => {
                  if (threadComposeStore.hasComposedContent) event.preventDefault();
                }}
              >
                <ContactComposePopover provider={identifier.provider} />
              </PopoverContent>
            </Popover>
          );
        })}

        {canEditChannels && <AddChannelPopover contactId={contactId} />}
      </div>
    </div>
  );
});
