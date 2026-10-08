"use client";

import type { ReactNode } from "react";
import type { RecordIdentityInput } from "@/features/records/record-identity.schema";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Copy, ExternalLink, Send, X } from "lucide-react";

import { Action, Resource } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { ContactValue } from "@/components/records/contact-value";
import { FormControlRow } from "@/components/forms/form-control-row";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { channelLabelKey, isEmailProvider, isHandleProvider, isPhoneProvider } from "@/ee/messaging/provider";
import { getChannelIcon } from "@/ee/messaging/provider-icon";
import { channelDisplayLabel, channelUrl } from "@/ee/messaging/thread-display";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

import { ContactComposePopover } from "./contact-compose-popover";

type Props = {
  emptyHint?: string;
  headingEndAddon?: ReactNode;
  controlStartAddon?: ReactNode;
  hideHeading?: boolean;
  recordChannels: {
    contextKey: string;
    captureContext: () => () => boolean;
    canCompose: () => boolean;
    channels: RecordIdentityInput[];
    canEdit: boolean;
    remove: (index: number) => void;
    addControl: ReactNode;
    inboxHref?: string;
  };
};

export const RecordChannels = observer(
  ({ emptyHint, headingEndAddon, controlStartAddon, hideHeading = false, recordChannels }: Props) => {
    const t = useTranslations();
    const rootStore = useRootStore();
    const { userStore, threadComposeStore, connectedAccountsStore } = rootStore;
    const copy = useCopyToClipboard();
    const [composeKey, setComposeKey] = useState<string | null>(null);
    const composeRequest = useRef(0);
    const composeOwner = useRef<(() => boolean) | null>(null);
    const canEditChannels = recordChannels.canEdit;
    const canStartThread =
      recordChannels.canCompose() &&
      userStore.can(Resource.inboxMessages, Action.create) &&
      rootStore.appMode !== "self-hosted";
    const identifiers = recordChannels.channels;
    const inboxHref = recordChannels.inboxHref;
    const canOpenInbox = Boolean(
      inboxHref &&
        identifiers.length > 0 &&
        rootStore.appMode !== "self-hosted" &&
        userStore.canAccess(Resource.inboxMessages),
    );

    useEffect(() => {
      composeRequest.current += 1;
      setComposeKey(null);
      return () => {
        composeRequest.current += 1;
        threadComposeStore.detachNewThread(recordChannels.contextKey);
      };
    }, [recordChannels.contextKey, threadComposeStore]);

    useEffect(() => {
      if (canStartThread) void connectedAccountsStore.ensureLoaded().catch(reportApplicationError);
    }, [canStartThread, connectedAccountsStore]);

    async function openCompose(identifier: RecordIdentityInput, key: string) {
      const request = ++composeRequest.current;
      const isCurrentRecord = recordChannels.captureContext();
      const isCurrentCompose = threadComposeStore.captureContext();
      const actorId = userStore.user?.id;
      await connectedAccountsStore.ensureLoaded();
      const current = () =>
        request === composeRequest.current &&
        isCurrentRecord() &&
        isCurrentCompose() &&
        actorId === userStore.user?.id &&
        userStore.can(Resource.inboxMessages, Action.create) &&
        rootStore.appMode !== "self-hosted" &&
        recordChannels.canCompose() &&
        !threadComposeStore.isLoading &&
        recordChannels.channels.some(
          (channel) =>
            channel.provider === identifier.provider &&
            channel.value === identifier.value &&
            channel.messagingId === identifier.messagingId,
        );
      if (!current()) return;
      const initialize = () => {
        if (!current()) return;
        const [first] = connectedAccountsStore.usableSendersFor(identifier.provider);
        let ownsInitializedCompose = () => false;
        threadComposeStore.initializeNewThread({
          sourceContextKey: recordChannels.contextKey,
          provider: identifier.provider,
          connectedAccountId: first?.id ?? "",
          recipients: [
            {
              identifier: identifier.messagingId ?? identifier.value,
              displayName: identifier.displayName ?? null,
            },
          ],
          onDone: () => {
            if (ownsInitializedCompose() && isCurrentRecord() && actorId === userStore.user?.id) setComposeKey(null);
          },
        });
        ownsInitializedCompose = threadComposeStore.captureContext();
        composeOwner.current = ownsInitializedCompose;
        setComposeKey(key);
      };
      if (threadComposeStore.hasUnsavedChanges) rootStore.navigationGuard.tryNavigate(initialize);
      else initialize();
    }

    function closeCompose() {
      if (threadComposeStore.isLoading) return;
      const request = composeRequest.current;
      const isCurrentRecord = recordChannels.captureContext();
      const ownsCompose = composeOwner.current;
      const close = () => {
        if (request !== composeRequest.current || !isCurrentRecord()) return;
        composeRequest.current += 1;
        if (ownsCompose?.()) threadComposeStore.discardNewThread();
        setComposeKey(null);
      };
      if (ownsCompose?.() && threadComposeStore.hasUnsavedChanges) rootStore.navigationGuard.tryNavigate(close);
      else close();
    }

    return (
      <div className="flex flex-col gap-2">
        {(!hideHeading || headingEndAddon || canOpenInbox) && (
          <div className={cn("flex items-center gap-1.5", hideHeading && "justify-end")}>
            {!hideHeading && (
              <span className="text-muted-foreground text-xs font-normal">{t("EntityChannels.heading")}</span>
            )}

            {headingEndAddon}

            {canOpenInbox && inboxHref && (
              <IconButton href={inboxHref} icon={ExternalLink} label={t("EntityChannels.tooltipOpenInbox")} />
            )}
          </div>
        )}

        <FormControlRow startAddon={controlStartAddon}>
          {identifiers.length === 0 && !canEditChannels && (
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
              const copyValue =
                channelUrl(identifier.provider, identifier.value, identifier.profileUrl) ?? primaryLabel;
              const contactKind = isEmailProvider(identifier.provider)
                ? "email"
                : isPhoneProvider(identifier.provider)
                  ? "phone"
                  : null;
              const isUnverified = isHandleProvider(identifier.provider) && !identifier.messagingId;
              const channelKey = `${identifier.provider}:${identifier.value}`;
              const composing = composeKey === channelKey;

              return (
                <Popover
                  key={channelKey}
                  open={composing}
                  onOpenChange={(next) => {
                    if (next) runUserAction(() => openCompose(identifier, channelKey));
                    else closeCompose();
                  }}
                >
                  <PopoverAnchor asChild>
                    <div
                      className="border-border bg-card flex items-center gap-3 rounded-md border px-3 py-2"
                      data-record-channel-key={channelKey}
                    >
                      <ProviderIcon className="size-6 shrink-0" />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground text-[11px] font-medium">{providerLabel}</span>
                        </div>

                        {contactKind ? (
                          <ContactValue
                            className="max-w-[18rem] text-sm font-medium"
                            kind={contactKind}
                            label={primaryLabel}
                            value={identifier.value}
                          />
                        ) : (
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
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {isUnverified && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex shrink-0">
                                <AppChip variant="secondary">{t("EntityChannels.unverified")}</AppChip>
                              </span>
                            </TooltipTrigger>

                            <TooltipContent className="max-w-64">
                              {t("EntityChannels.tooltipUnverified")}
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {canStartThread && (
                          <Tooltip>
                            <PopoverTrigger asChild>
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
                                >
                                  <Send className="size-4" />
                                </Button>
                              </TooltipTrigger>
                            </PopoverTrigger>

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
                                type="button"
                                variant="ghost"
                                onClick={() => recordChannels.remove(index)}
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
                      if (threadComposeStore.hasUnsavedChanges || threadComposeStore.isLoading) event.preventDefault();
                    }}
                  >
                    <ContactComposePopover provider={identifier.provider} />
                  </PopoverContent>
                </Popover>
              );
            })}

            {canEditChannels && recordChannels.addControl}
          </div>
        </FormControlRow>
      </div>
    );
  },
);
