import type { AccountOwnerDto } from "./get-messaging-thread.interactor";
import type { EmailFolder } from "../email-folders";

export abstract class ThreadAccountOwnersRepo {
  abstract listAccountOwnersByIds(accountIds: string[]): Promise<Record<string, AccountOwnerDto>>;
  abstract findFolderContextById(
    accountId: string,
  ): Promise<{ folders: EmailFolder[]; selectedFolderIds: string[] } | null>;
  abstract findSharedThreadFolderContext(
    threadId: string,
    folderIds: string[],
  ): Promise<{ folders: EmailFolder[]; selectedFolderIds: string[] } | null>;
}
