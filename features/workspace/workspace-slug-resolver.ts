import type { WorkspaceSlugRepo } from "./workspace-slug.repo";

type WorkspaceOwner = { companyId: string; company?: { slug: string } | null };

export class WorkspaceSlugResolver {
  private readonly slugs = new Map<string, Promise<string | null>>();

  constructor(private readonly repo: WorkspaceSlugRepo) {}

  slugOf(owner: WorkspaceOwner): Promise<string | null> {
    if (owner.company?.slug) return Promise.resolve(owner.company.slug);
    return this.slugFor(owner.companyId);
  }

  slugFor(companyId: string): Promise<string | null> {
    let slug = this.slugs.get(companyId);
    if (!slug) {
      slug = this.repo.findWorkspaceSlugUnscoped(companyId);
      this.slugs.set(companyId, slug);
    }
    return slug;
  }

  async requireSlugOf(owner: WorkspaceOwner): Promise<string> {
    const slug = await this.slugOf(owner);
    if (!slug) throw new Error("Workspace slug is missing");
    return slug;
  }
}
