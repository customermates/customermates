"use client";

import type { MessagingProvider } from "@/generated/prisma";
import type { MessagingAttendee } from "@/ee/messaging/messaging.schema";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { UserPlus, Users } from "lucide-react";

import { Action, Resource } from "@/generated/prisma";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { AppModal } from "@/components/modal";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/lib/utils";

import { ThreadPeopleManager } from "./thread-participants-contacts";
import { displayableIdentifier, participantLabel } from "@/ee/messaging/thread-display";

type Props = {
  threadId: string;
  provider: MessagingProvider;
  participants: MessagingAttendee[];
  sharedToCrm: boolean;
  accountShared: boolean;
  isOwner: boolean;
};

export const ThreadSettings = observer(
  ({ threadId, provider, participants, sharedToCrm, accountShared, isOwner }: Props) => {
    const t = useTranslations();
    const { userStore, threadParticipantsStore, messagingThreadDetailStore } = useRootStore();

    useEffect(() => threadParticipantsStore.bind(threadId), [threadId, threadParticipantsStore]);

    const canManageContacts = userStore.can(Resource.contacts, Action.update);
    const selfParticipant = participants.find((p) => p.isSelf) ?? null;
    const accountOwner =
      messagingThreadDetailStore.accountOwners[messagingThreadDetailStore.thread?.connectedAccountId ?? ""] ?? null;
    const selfLabel = isOwner
      ? t("Inbox.senderYou")
      : accountOwner?.displayName?.trim() ||
        (selfParticipant
          ? participantLabel(selfParticipant, provider, t("Inbox.senderUnknown"))
          : t("Inbox.senderUnknown"));
    const linkable = participants.filter((p) => !p.isSelf && p.identifier.trim());
    const unlinkedCount = linkable.filter((p) => !p.contact).length;
    const showBadge = canManageContacts && unlinkedCount > 0;
    const isShared = accountShared || sharedToCrm;

    return (
      <>
        <ClickableChip
          aria-label={t("Inbox.settings.title")}
          className={cn("h-8", showBadge && "rounded-r-none")}
          size="md"
          startContent={
            linkable.length > 0 ? (
              <OverlappingStack
                badgeKey={(p) => p.identifier}
                badges={linkable}
                renderBadge={(p) => (
                  <Avatar
                    name={participantLabel(p, provider, t("Inbox.senderUnknown"))}
                    size="sm"
                    src={p.contact?.avatarUrl ?? p.pictureUrl ?? undefined}
                  />
                )}
                renderOverflow={(count) => <Avatar fallback={`+${count}`} size="sm" />}
                size="sm"
              />
            ) : (
              <Users className="size-3.5" />
            )
          }
          title={t("Inbox.settings.tooltip")}
          variant="secondary"
          onClick={() => threadParticipantsStore.setOpen(true)}
        >
          <span className="hidden sm:inline">
            {isShared ? t("Inbox.shareToCrmShared") : t("Inbox.shareToCrmPrivate")}
          </span>
        </ClickableChip>

        {showBadge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("Inbox.unlinkedParticipants")}
                className="-ml-1 h-8 gap-1 rounded-l-none px-2"
                type="button"
                variant="softPrimary"
                onClick={() => threadParticipantsStore.setOpen(true)}
              >
                <UserPlus className="size-3.5" />

                <span className="text-xs font-medium">{unlinkedCount}</span>
              </Button>
            </TooltipTrigger>

            <TooltipContent>{t("Inbox.unlinkedParticipants")}</TooltipContent>
          </Tooltip>
        )}

        <AppModal
          open={threadParticipantsStore.isOpen}
          title={t("Inbox.settings.title")}
          onClose={() => threadParticipantsStore.setOpen(false)}
        >
          <AppCard>
            <AppCardHeader>
              <h2 className="text-x-lg">{t("Inbox.settings.title")}</h2>
            </AppCardHeader>

            <AppCardBody className="gap-6">
              <label
                className={cn(
                  "flex items-start justify-between gap-4 rounded-lg border p-4",
                  isOwner && !accountShared ? "cursor-pointer" : "cursor-default",
                )}
                htmlFor="thread-shared"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{t("Inbox.settings.visibilityTitle")}</span>

                  <span className="text-muted-foreground text-xs">
                    {accountShared
                      ? t("Inbox.shareToCrmViaAccount")
                      : isShared
                        ? t("Inbox.shareToCrmActive")
                        : t("Inbox.settings.visibilityHint")}
                  </span>
                </span>

                <Switch
                  checked={isShared}
                  disabled={accountShared || !isOwner}
                  id="thread-shared"
                  onCheckedChange={(next) => void messagingThreadDetailStore.toggleSharing(next)}
                />
              </label>

              {(selfParticipant || accountOwner || linkable.length > 0) && (
                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium">{t("Inbox.settings.people")}</h3>

                  <div className="flex flex-col gap-1">
                    {(selfParticipant || accountOwner) && (
                      <div className="flex items-center gap-3 py-2">
                        <Avatar name={selfLabel} size="lg" src={selfParticipant?.pictureUrl ?? undefined} />

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{selfLabel}</div>

                          {(selfParticipant?.identifier || accountOwner?.accountLabel) && (
                            <div className="text-muted-foreground truncate text-xs">
                              {selfParticipant?.identifier
                                ? displayableIdentifier(provider, selfParticipant.identifier)
                                : accountOwner?.accountLabel}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <ThreadPeopleManager canManage={canManageContacts} participants={linkable} provider={provider} />
                  </div>
                </section>
              )}
            </AppCardBody>
          </AppCard>
        </AppModal>
      </>
    );
  },
);
