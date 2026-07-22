"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

import { useTranslations } from "next-intl";
import { Folder } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { Icon } from "@/components/shared/icon";
import { cn } from "@/core/utils/cn";

type Props = {
  account: ConnectedAccountDto;
  editable?: boolean;
  onToggle?: (folderId: string, on: boolean) => void;
};

export function AccountFolders({ account, editable = false, onToggle }: Props) {
  const t = useTranslations();

  if (account.folders.length === 0) return null;

  const folders = [...account.folders].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const selected = new Set(account.selectedFolderIds);

  return (
    <ul className="divide-border/60 flex w-full flex-col divide-y">
      {folders.map((folder) => {
        const on = selected.has(folder.id);

        return (
          <li key={folder.id} className="flex items-center gap-2 py-2">
            <Icon className="text-muted-foreground size-4 shrink-0" icon={Folder} />

            <span className="min-w-0 flex-1 truncate text-sm">{folder.name ?? folder.id}</span>

            {editable && onToggle ? (
              <Switch checked={on} onCheckedChange={(next) => onToggle(folder.id, next)} />
            ) : (
              <span className={cn("shrink-0 text-[11px]", on ? "text-success" : "text-subdued")}>
                {on ? t("ConnectedAccountsCard.folderSynced") : t("ConnectedAccountsCard.folderHidden")}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
