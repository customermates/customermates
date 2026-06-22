"use client";

import type { IdentifierInput } from "@/features/contacts/contact.schema";

import { useEffect } from "react";
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
import { useRootStore } from "@/core/stores/root-store.provider";

import { AddChannelPopover } from "./add-channel-popover";

type Props = {
  contactId: string;
  emptyHint?: string;
};

export const ContactChannels = observer(({ contactId, emptyHint }: Props) => {
  const t = useTranslations();
  const { userStore, contactDetailStore, startChatModalStore, connectedAccountsStore } = useRootStore();
  const copy = useCopyToClipboard();
  const canEditChannels = userStore.can(Resource.contacts, Action.update);
  const canStartThread = userStore.can(Resource.inboxMessages, Action.create);
  const identifiers = contactDetailStore.channels;

  useEffect(() => {
    if (canStartThread) void connectedAccountsStore.ensureLoaded();
  }, [canStartThread, connectedAccountsStore]);

  function handleStartChat(identifier: IdentifierInput) {
    void startChatModalStore.openFor({
      provider: identifier.provider,
      recipientIdentifier: identifier.messagingId ?? identifier.value,
      recipientDisplayName: identifier.displayName ?? null,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-xs font-normal">{t("EntityChannels.heading")}</span>

        {identifiers.length > 0 && (
          <IconButton
            href={`/inbox?filters=${encodeURIComponent(`participantContactId:in:${contactId}`)}`}
            icon={ExternalLink}
            label={t("EntityChannels.tooltipOpenInbox")}
          />
        )}

        {canEditChannels && <AddChannelPopover contactId={contactId} />}
      </div>

      {identifiers.length === 0 && (
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

          return (
            <div
              key={`${identifier.provider}:${identifier.value}`}
              className="border-border bg-card flex items-center gap-3 rounded-md border px-3 py-2"
            >
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

                  <IconButton icon={Copy} label={t("EntityChannels.ariaCopy")} onClick={() => void copy(copyValue)} />
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
                        aria-label={t("EntityChannels.ariaStartThread", {
                          provider: providerLabel,
                        })}
                        className="text-muted-foreground hover:text-foreground"
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() => handleStartChat(identifier)}
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
          );
        })}
      </div>
    </div>
  );
});
