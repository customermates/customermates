"use client";

import type { EmailFolder } from "@/ee/messaging/email-folders";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";

import { Check, ChevronDown, Folder, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { emailMoveTargets, isMovableEmailFolder } from "@/ee/messaging/email-folders";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

type Props = {
  message: MessagingMessageDto;
  folders: EmailFolder[];
  moving?: boolean;
  onMove?: (folderId: string) => void;
};

export const MessageFolderMenu = observer(({ message, folders, moving = false, onMove }: Props) => {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const currentIds = [...new Set(message.folderIds ?? [])];
  const locations = currentIds
    .map((id) => ({ id, name: byId.get(id)?.name?.trim() || t("Common.unnamed") }))
    .sort((left, right) => intlStore.collator.compare(left.name, right.name));
  if (locations.length === 0) return null;

  const canMove =
    Boolean(onMove) &&
    !message.isDraft &&
    !message.isDeleted &&
    currentIds.every((id) => isMovableEmailFolder(byId.get(id) ?? {}));
  const targets = canMove
    ? emailMoveTargets(folders, message.provider)
        .map((entry) => ({ id: entry.id, name: entry.name?.trim() || t("Common.unnamed") }))
        .sort((left, right) => intlStore.collator.compare(left.name, right.name))
    : [];
  const primary = locations.find((entry) => byId.get(entry.id)?.role?.toUpperCase() === "INBOX") ?? locations[0];
  const label = t("Inbox.folders.messageOptions", { folders: locations.map((entry) => entry.name).join(", ") });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className="text-muted-foreground h-6 min-w-0 max-w-48 shrink self-start gap-1 px-0 text-xs font-normal has-[>svg]:px-0"
          data-message-folder={message.id}
          disabled={moving}
          size="xs"
          type="button"
          variant="ghost"
        >
          {moving ? <Loader2 className="size-3 animate-spin" /> : <Folder className="size-3" />}

          <span className="min-w-0 truncate">{primary.name}</span>

          {locations.length > 1 && <span>+{intlStore.formatNumber(locations.length - 1)}</span>}

          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" aria-label={label} className="max-w-80">
        <DropdownMenuLabel>{t("Inbox.folders.messageLocations")}</DropdownMenuLabel>

        {locations.map((entry) => (
          <div key={entry.id} className="flex items-start gap-2 px-2 py-1.5 text-xs">
            <Check className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />

            <span className="min-w-0 break-words">{entry.name}</span>
          </div>
        ))}

        {targets.length > 0 && (
          <>
            <DropdownMenuSeparator />

            <DropdownMenuLabel>{t("Inbox.folders.moveMessage")}</DropdownMenuLabel>

            {targets.map((entry) => (
              <DropdownMenuItem
                key={entry.id}
                disabled={moving || currentIds.includes(entry.id)}
                onSelect={() => onMove?.(entry.id)}
              >
                <Folder />

                <span className="min-w-0 break-words whitespace-normal">{entry.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
