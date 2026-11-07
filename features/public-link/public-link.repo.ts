export type StoredPublicLink = {
  id: string;
  viewId: string;
  createdById: string;
  expiresAt: Date | null;
  openCount: number;
  lastOpenedAt: Date | null;
  createdAt: Date;
};

export abstract class PublicLinkRepo {
  abstract findOwnedPublishableViewName(viewId: string): Promise<string | null>;
  abstract findActiveLink(viewId: string): Promise<StoredPublicLink | null>;
  abstract createLink(viewId: string, expiresAt: Date | null): Promise<StoredPublicLink>;
  abstract setExpiry(linkId: string, expiresAt: Date | null): Promise<StoredPublicLink>;
  abstract revokeActiveLinks(viewId: string): Promise<number>;
  abstract recordOpen(linkId: string): Promise<void>;
  abstract publicLinksAllowed(): Promise<boolean>;
}
