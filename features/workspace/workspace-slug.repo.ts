export abstract class WorkspaceSlugRepo {
  abstract findWorkspaceSlugUnscoped(companyId: string): Promise<string | null>;
}
