export abstract class UpdateWorkspaceSlugRepo {
  abstract updateCompanySlug(slug: string): Promise<"updated" | "taken">;
}
