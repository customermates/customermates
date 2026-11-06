export type PublicLinkLookup = {
  id: string;
  companyId: string;
  viewId: string;
  createdById: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  view: { name: string; surfaceKey: string; userId: string; deletedAt: Date | null };
  company: { name: string | null; allowPublicLinks: boolean; deletingAt: Date | null };
};

export abstract class PublicLinkLookupRepo {
  abstract findLinkUnscoped(linkId: string): Promise<PublicLinkLookup | null>;
}
