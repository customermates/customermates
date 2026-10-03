import { z } from "zod";

import { FilterOptionSchema } from "@/core/base/base-get.schema";
import { zx } from "@/core/validation/validation.utils";

export const MessagingFilterOptionsSchema = z.object({
  accounts: z.array(FilterOptionSchema),
  folders: z.array(FilterOptionSchema),
});
export type MessagingFilterOptions = z.infer<typeof MessagingFilterOptionsSchema>;

const FolderReferenceSchema = z.tuple([z.uuid(), zx.nulFreeText().min(1)]);

export function emailFolderFilterValue(accountId: string, folderId: string) {
  return JSON.stringify([accountId, folderId]);
}

export function parseEmailFolderFilterValue(value: string): { accountId: string; folderId: string } | null {
  try {
    const parsed = FolderReferenceSchema.safeParse(JSON.parse(value));
    return parsed.success ? { accountId: parsed.data[0], folderId: parsed.data[1] } : null;
  } catch {
    return null;
  }
}
