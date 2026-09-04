"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { Folder } from "lucide-react";

import { AppChip } from "@/components/chip/app-chip";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export const ThreadFolderChip = observer(() => {
  const t = useTranslations();
  const { messagingThreadDetailStore } = useRootStore();
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
});
