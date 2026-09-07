"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Folder } from "lucide-react";
import { Action, Resource } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { badgeVariants } from "@/components/ui/badge";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { emailMoveTargets } from "@/ee/messaging/email-folders";

export const ThreadFolderChip = observer(() => {
  const t = useTranslations();
  const { userStore, messagingThreadDetailStore } = useRootStore();
  const intlStore = useHydratedIntlStore();
  const context = messagingThreadDetailStore.folderContext;
  if (!context) return null;

  const byId = new Map(context.folders.map((folder) => [folder.id, folder]));
  const names = context.currentFolderIds
    .map((id) => byId.get(id)?.name?.trim() || t("Common.unnamed"))
    .sort((a, b) => intlStore.collator.compare(a, b));

  const folder = names.length > 0 ? names.join(", ") : t("Inbox.folders.none");
  const hidden =
    context.currentFolderIds.length > 0 &&
    !context.currentFolderIds.some((id) => context.selectedFolderIds.includes(id));
  const label = hidden ? t("Inbox.folders.hiddenTooltip", { folder }) : t("Inbox.folders.current", { folder });

  const provider = messagingThreadDetailStore.thread?.provider;
  const targets = (provider ? emailMoveTargets(context.folders, provider) : [])
    .map((entry) => ({ id: entry.id, name: entry.name?.trim() || t("Common.unnamed") }))
    .sort((left, right) => intlStore.collator.compare(left.name, right.name));

  if (!userStore.can(Resource.inboxMessages, Action.update) || targets.length === 0) {
    return (
      <AppChip
        aria-label={label}
        className="size-8 shrink-0 gap-0 px-0 bg-secondary shadow-xs sm:w-auto sm:shrink sm:gap-1.5 sm:px-2"
        size="md"
        startContent={<Folder className="size-3.5" />}
        tooltip={label}
        variant="outline"
      >
        <span className="hidden sm:inline">{folder}</span>
      </AppChip>
    );
  }

  return (
    <Select
      value={context.currentFolderIds.find((id) => byId.has(id)) ?? ""}
      onValueChange={(next) => runUserAction(() => messagingThreadDetailStore.moveToFolder(next))}
    >
      <SelectTrigger
        aria-label={label}
        className={cn(
          badgeVariants({ variant: "outline", interactive: true }),
          "h-8! w-8 shrink-0 gap-0 rounded-md bg-secondary px-0 text-xs shadow-xs",
          "[&>svg:last-child]:hidden sm:w-auto sm:shrink sm:gap-1.5 sm:px-2 sm:[&>svg:last-child]:block",
        )}
        id="inbox-thread-folder"
        title={label}
      >
        <Folder className="size-3.5" />

        <span className="hidden truncate sm:inline">{folder}</span>
      </SelectTrigger>

      <SelectContent>
        {targets.map((entry) => (
          <SelectItem key={entry.id} textValue={entry.name} value={entry.id}>
            {entry.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
