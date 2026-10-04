import type { EmailFolder } from "../email-folders";

export abstract class MoveEmailThreadAccountRepo {
  abstract findFolderContextById(
    accountId: string,
  ): Promise<{ folders: EmailFolder[]; selectedFolderIds: string[] } | null>;
}
