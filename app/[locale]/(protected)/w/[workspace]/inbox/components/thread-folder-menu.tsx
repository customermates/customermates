"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Folder, FolderInput } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { TopBarMenuButton } from "@/components/shared/top-bar-action-buttons";
import { TruncatedText } from "@/components/shared/truncated-text";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";
import { emailMoveTargets } from "@/ee/messaging/email-folders";

export const ThreadFolderMenu = observer(() => {
  const t = useTranslations();
  const { userStore, messagingThreadDetailStore: detail } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const context = detail.folderContext;
  const thread = detail.thread;
  if (!context?.canMove || !thread || !userStore.can(Resource.inboxMessages, Action.update)) return null;

  const targets = emailMoveTargets(context.folders, thread.provider)
    .map((entry) => ({ id: entry.id, name: entry.name?.trim() || t("Common.unnamed") }))
    .sort((left, right) => intlStore.collator.compare(left.name, right.name));
  if (targets.length === 0) return null;

  const moving = detail.movingThreadIds.has(thread.id);
  const label = t("Inbox.folders.moveConversation");

  return (
    <TopBarMenuButton
      data-thread-folder-move
      anchorId="inbox-thread-folder"
      busy={moving}
      icon={FolderInput}
      label={label}
    >
      <DropdownMenuLabel>{label}</DropdownMenuLabel>

      {targets.map((entry) => (
        <DropdownMenuItem
          key={entry.id}
          disabled={moving}
          onSelect={() => runUserAction(() => detail.moveToFolder(entry.id))}
        >
          <Folder />

          <TruncatedText className="max-w-64">{entry.name}</TruncatedText>
        </DropdownMenuItem>
      ))}
    </TopBarMenuButton>
  );
});
