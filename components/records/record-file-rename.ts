"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { renamedRecordFileName } from "@/features/record-files/record-file-name";

import { renameRecordFile } from "./record-file-upload";

type RenamableFile = { id: string; name: string };

export type RecordFileRename = {
  nameOf: (file: RenamableFile) => string;
  rename: (file: RenamableFile, requested: string) => Promise<void>;
};

export function useRecordFileRename(): RecordFileRename {
  const t = useTranslations();
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const nameOf = (file: RenamableFile) => names.get(file.id) ?? file.name;
  const show = (fileId: string, name: string) => setNames((current) => new Map(current).set(fileId, name));
  return {
    nameOf,
    rename: async (file, requested) => {
      const previous = nameOf(file);
      const optimistic = renamedRecordFileName(previous, requested);
      if (!optimistic) {
        toast.error(t("Common.errors.recordFileNameInvalid"));
        return;
      }
      if (optimistic === previous) return;
      show(file.id, optimistic);
      const result = await renameRecordFile(file.id, requested);
      show(file.id, result.ok ? result.data.name : previous);
      if (!result.ok) toast.error(result.message ?? t("RecordModel.fileRenameFailed"));
    },
  };
}
