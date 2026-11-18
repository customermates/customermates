import type { BrandPatch, StoredBrand, StoredBrandLogo, WorkspaceBrandRepo } from "./workspace-brand.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

const BRAND_SELECT = { accentColor: true, logoKey: true } as const;

export class PrismaWorkspaceBrandRepo extends TenantRepository implements WorkspaceBrandRepo {
  find(): Promise<StoredBrand | null> {
    return this.prisma.companyBrand.findFirst({ where: { companyId: this.companyId }, select: BRAND_SELECT });
  }

  save(patch: BrandPatch): Promise<StoredBrand> {
    const changes = {
      ...(patch.accentColor === undefined ? {} : { accentColor: patch.accentColor }),
      ...(patch.logo === undefined
        ? {}
        : patch.logo === null
          ? { logo: null, logoType: null, logoKey: null }
          : { logo: patch.logo.bytes, logoType: patch.logo.type, logoKey: patch.logo.key }),
    };

    return this.prisma.companyBrand.upsert({
      where: { companyId: this.companyId },
      create: { companyId: this.companyId, ...changes },
      update: { companyId: this.companyId, ...changes },
      select: BRAND_SELECT,
    });
  }

  @BypassTenantGuard
  async findLogoByKeyUnscoped(logoKey: string): Promise<StoredBrandLogo | null> {
    const row = await this.prisma.companyBrand.findUnique({
      where: { logoKey },
      select: { logo: true, logoType: true },
    });
    if (!row?.logo || !row.logoType) return null;

    return { bytes: row.logo, type: row.logoType };
  }
}
