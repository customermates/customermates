import type { ThreadFolderContext } from "@/ee/messaging/inbox/get-messaging-thread.interactor";
import type { MessagingProvider } from "@/generated/prisma";

import { emailMoveTargets } from "@/ee/messaging/email-folders";

export function threadFolder(
  context: ThreadFolderContext | null,
  provider: MessagingProvider,
): {
  id: string | null;
  name: string;
  hiddenFromInbox: boolean;
  moveTargets: { id: string; name: string }[];
} | null {
  if (!context || context.currentFolderIds.length === 0) return null;

  const byId = new Map(context.folders.map((folder) => [folder.id, folder]));
  const names = context.currentFolderIds.map((id) => byId.get(id)?.name?.trim() || "Unnamed").sort();

  return {
    id: context.currentFolderIds.find((id) => byId.has(id)) ?? null,
    name: names.join(", "),
    hiddenFromInbox: !context.currentFolderIds.some((id) => context.selectedFolderIds.includes(id)),
    moveTargets: emailMoveTargets(context.folders, provider).map((folder) => ({
      id: folder.id,
      name: folder.name?.trim() || "Unnamed",
    })),
  };
}
