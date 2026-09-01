"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { EyeOff, Folder } from "lucide-react";

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

  const label = names.length > 0 ? names.join(", ") : t("Inbox.folders.none");
  const hidden =
    context.currentFolderIds.length > 0 &&
    !context.currentFolderIds.some((id) => context.selectedFolderIds.includes(id));

  return (
    <AppChip
      aria-label={t("Inbox.folders.current", { folder: label })}
      className="h-8 bg-secondary shadow-xs"
      size="md"
      startContent={hidden ? <EyeOff className="size-3.5" /> : <Folder className="size-3.5" />}
      tooltip={
        hidden ? t("Inbox.folders.hiddenTooltip", { folder: label }) : t("Inbox.folders.current", { folder: label })
      }
      variant="outline"
    >
      <span className="hidden sm:inline">{label}</span>
    </AppChip>
  );
});
