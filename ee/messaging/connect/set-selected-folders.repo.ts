import type { ConnectedAccountRecord } from "../messaging.schema";
import type { EmailFolder } from "../email-folders";

export abstract class SetSelectedFoldersRepo {
  abstract getAccountFolderContextOrThrow(id: string): Promise<{
    id: string;
    unipileAccountId: string;
    folders: EmailFolder[];
    selectedFolderIds: string[];
    sentFolderIds: string[];
  }>;
  abstract setSelectedFoldersOrThrow(args: {
    id: string;
    selectedFolderIds: string[];
  }): Promise<ConnectedAccountRecord>;
}
