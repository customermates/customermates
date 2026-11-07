import type { PublicLinkLookup, PublicLinkLookupRepo } from "./public-link-lookup.repo";
import type { PublicLinkRepo, StoredPublicLink } from "./public-link.repo";

import { SURFACE } from "@/core/data-view/data-view-keys";
import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";

import { isPublishableSurface } from "./public-link-surface";

const LINK_SELECT = {
  id: true,
  viewId: true,
  createdById: true,
  expiresAt: true,
  openCount: true,
  lastOpenedAt: true,
  createdAt: true,
} as const;

export class PrismaPublicLinkRepo extends TenantRepository implements PublicLinkRepo, PublicLinkLookupRepo {
  async findOwnedPublishableViewName(viewId: string) {
    const view = await this.prisma.dataView.findFirst({
      where: {
        id: viewId,
        companyId: this.companyId,
        userId: this.userId,
        OR: [{ surfaceKey: SURFACE.dashboard }, { surfaceKey: { startsWith: "records:" } }],
        deletedAt: null,
      },
      select: { name: true, surfaceKey: true },
    });
    return view && isPublishableSurface(view.surfaceKey) ? view.name : null;
  }

  findActiveLink(viewId: string): Promise<StoredPublicLink | null> {
    return this.prisma.publicViewLink.findFirst({
      where: { companyId: this.companyId, viewId, createdById: this.userId, revokedAt: null },
      select: LINK_SELECT,
      orderBy: { createdAt: "desc" },
    });
  }

  @Transaction
  async createLink(viewId: string, expiresAt: Date | null): Promise<StoredPublicLink> {
    await this.revokeActiveLinks(viewId);
    return this.prisma.publicViewLink.create({
      data: { companyId: this.companyId, viewId, createdById: this.userId, expiresAt },
      select: LINK_SELECT,
    });
  }

  setExpiry(linkId: string, expiresAt: Date | null): Promise<StoredPublicLink> {
    return this.prisma.publicViewLink.update({
      where: { id: linkId, companyId: this.companyId, createdById: this.userId },
      data: { expiresAt },
      select: LINK_SELECT,
    });
  }

  async revokeActiveLinks(viewId: string) {
    const { count } = await this.prisma.publicViewLink.updateMany({
      where: { companyId: this.companyId, viewId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  async recordOpen(linkId: string) {
    await this.prisma.publicViewLink.updateMany({
      where: { id: linkId, companyId: this.companyId },
      data: { openCount: { increment: 1 }, lastOpenedAt: new Date() },
    });
  }

  async publicLinksAllowed() {
    const company = await this.prisma.company.findUnique({
      where: { id: this.companyId },
      select: { allowPublicLinks: true },
    });
    return company?.allowPublicLinks === true;
  }

  @BypassTenantGuard
  findLinkUnscoped(linkId: string): Promise<PublicLinkLookup | null> {
    return this.prisma.publicViewLink.findUnique({
      where: { id: linkId },
      select: {
        id: true,
        companyId: true,
        viewId: true,
        createdById: true,
        expiresAt: true,
        revokedAt: true,
        view: { select: { name: true, surfaceKey: true, userId: true, deletedAt: true } },
        company: { select: { name: true, allowPublicLinks: true, deletingAt: true } },
      },
    });
  }
}
