"use client";

import type { MessagingProvider } from "@/generated/prisma";
import type { MessagingAttendee } from "@/ee/messaging/messaging.schema";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { UserPlus, Users } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { OverlappingStack } from "@/components/shared/overlapping-stack";
import { AppModal } from "@/components/modal";
import { Avatar } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { ThreadPeopleManager } from "./thread-participants-contacts";
import { ThreadRecords } from "./thread-records";
import { CopyableAddress } from "./copyable-address";
import { participantAvatar, displayableIdentifier, participantLabel } from "@/ee/messaging/thread-display";
import { runUserAction } from "@/core/errors/report-application-error";

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
    const { threadParticipantsStore, messagingThreadDetailStore } = useRootStore();

    useEffect(() => threadParticipantsStore.bind(threadId), [threadId, threadParticipantsStore]);

    const canManageContacts = threadParticipantsStore.canManageRecords;
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
    const unlinkedCount = linkable.filter((p) => p.records.length === 0).length;
    const showBadge = canManageContacts && unlinkedCount > 0;
    const isShared = accountShared || sharedToCrm;

    return (
      <>
        <ClickableChip
          aria-label={t("Inbox.settings.title")}
          className="h-8 bg-secondary shadow-xs"
          endContent={
            showBadge ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <UserPlus aria-hidden className="size-3.5" />

                {unlinkedCount}

                <span className="sr-only">{t("Inbox.unlinkedParticipants")}</span>
              </span>
            ) : undefined
          }
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
                    src={participantAvatar(p) ?? undefined}
                  />
                )}
                renderOverflow={(count) => <Avatar fallback={`+${count}`} size="sm" />}
                size="sm"
              />
            ) : (
              <Users className="size-3.5" />
            )
          }
          tooltip={t("Inbox.settings.tooltip")}
          variant="outline"
          onClick={() => threadParticipantsStore.setOpen(true)}
        >
          <span className="hidden sm:inline">
            {isShared ? t("Inbox.shareToCrmShared") : t("Inbox.shareToCrmPrivate")}
          </span>
        </ClickableChip>

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
              <div className="flex items-start gap-3">
                <Switch
                  checked={isShared}
                  className="mt-0.5"
                  disabled={accountShared || !isOwner}
                  id="thread-shared"
                  onCheckedChange={(next) => runUserAction(() => messagingThreadDetailStore.toggleSharing(next))}
                />

                <label
                  className={cn(
                    "flex flex-col gap-0.5",
                    isOwner && !accountShared ? "cursor-pointer" : "cursor-default",
                  )}
                  htmlFor="thread-shared"
                >
                  <span className="text-sm font-medium">{t("Inbox.settings.visibilityTitle")}</span>

                  <span className="text-xs text-muted-foreground">
                    {accountShared
                      ? t("Inbox.shareToCrmViaAccount")
                      : isShared
                        ? t("Inbox.shareToCrmActive")
                        : t("Inbox.settings.visibilityHint")}
                  </span>
                </label>
              </div>

              {(selfParticipant || accountOwner || linkable.length > 0) && (
                <section aria-labelledby="thread-people" className="flex flex-col gap-1">
                  <h3 className="text-xs text-muted-foreground" id="thread-people">
                    {t("Inbox.settings.people")}
                  </h3>

                  {(selfParticipant || accountOwner) && (
                    <div className="flex min-w-0 items-center gap-3 py-1.5">
                      <Avatar name={selfLabel} src={selfParticipant?.pictureUrl ?? undefined} />

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{selfLabel}</div>

                        {(selfParticipant?.identifier || accountOwner?.accountLabel) && (
                          <CopyableAddress
                            className="max-w-full text-xs text-muted-foreground"
                            value={
                              selfParticipant?.identifier
                                ? (displayableIdentifier(provider, selfParticipant.identifier) ?? "")
                                : (accountOwner?.accountLabel ?? "")
                            }
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <ThreadPeopleManager canManage={canManageContacts} participants={linkable} provider={provider} />
                </section>
              )}

              <ThreadRecords threadId={threadId} />
            </AppCardBody>
          </AppCard>
        </AppModal>
      </>
    );
  },
);
