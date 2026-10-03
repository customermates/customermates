"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Folder, FolderInput, Loader2 } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  if (!context || !thread || !userStore.can(Resource.inboxMessages, Action.update)) return null;

  const targets = emailMoveTargets(context.folders, thread.provider)
    .map((entry) => ({ id: entry.id, name: entry.name?.trim() || t("Common.unnamed") }))
    .sort((left, right) => intlStore.collator.compare(left.name, right.name));
  if (targets.length === 0) return null;

  const moving = detail.movingThreadIds.has(thread.id);
  const label = t("Inbox.folders.moveConversation");

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              data-thread-folder-move
              aria-label={label}
              disabled={moving}
              id="inbox-thread-folder"
              size="icon-sm"
              type="button"
              variant="secondary"
            >
              {moving ? <Loader2 className="size-3.5 animate-spin" /> : <FolderInput className="size-3.5" />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>

        <TooltipContent>{moving ? t("PageState.loading") : label}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" aria-label={label} aria-labelledby="inbox-thread-folder">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>

        {targets.map((entry) => (
          <DropdownMenuItem
            key={entry.id}
            disabled={moving}
            title={entry.name}
            onSelect={() => runUserAction(() => detail.moveToFolder(entry.id))}
          >
            <Folder />

            <span className="max-w-64 truncate">{entry.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
