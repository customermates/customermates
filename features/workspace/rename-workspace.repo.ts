export abstract class RenameWorkspaceRepo {
  abstract renameCompany(name: string): Promise<void>;
}
