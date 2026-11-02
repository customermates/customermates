"use client";

import type { AttachmentMeta } from "./attachment-classify";

import { useTranslations } from "next-intl";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useWorkspaceSlug } from "@/i18n/navigation";

import { attachmentProxyUrl, attachmentSubtitle, describeFile } from "./attachment-classify";
import { AttachmentRow } from "./attachment-row";

type Props = {
  draftMessageId: string;
  files: AttachmentMeta[];
  onRemove: (fileId: string) => void;
};

export function ComposerDraftFiles({ draftMessageId, files, onRemove }: Props) {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const workspaceSlug = useWorkspaceSlug();

  return (
    <div className="flex flex-col gap-1.5 px-3 pb-1.5">
      {files.map((file) => {
        const { Icon: FileTypeIcon, accent } = describeFile(file);
        return (
          <AttachmentRow
            key={file.id}
            accent={accent}
            fileIcon={FileTypeIcon}
            name={file.fileName?.trim() || file.name?.trim() || t("Inbox.attachmentFile")}
            removeLabel={t("Inbox.compose.attachRemove")}
            subtitle={attachmentSubtitle(t, file, (value, options) => intlStore.formatNumber(value, options))}
            onOpen={() => window.open(attachmentProxyUrl(draftMessageId, file.id, workspaceSlug), "_blank", "noopener")}
            onRemove={() => file.fileId && onRemove(file.fileId)}
          />
        );
      })}
    </div>
  );
}
