import type { ReconcileBillingUsageRepo } from "./reconcile-billing-usage.repo";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

import { BillingUsageLedger } from "./billing-usage-ledger";

export class PrismaReconcileBillingUsageRepo extends TenantRepository implements ReconcileBillingUsageRepo {
  private readonly ledger = new BillingUsageLedger();

  @BypassTenantGuard
  async listCompanyIdsUnscoped(): Promise<string[]> {
    const companies = await this.prisma.company.findMany({ select: { id: true }, orderBy: { id: "asc" } });

    return companies.map((company) => company.id);
  }

  @BypassTenantGuard
  async listRecordedWorkspacesWithoutCompanyUnscoped(): Promise<string[]> {
    const [recorded, companies] = await Promise.all([
      this.prisma.billingUsageWorkspace.findMany({ where: { deletedAt: null }, select: { companyId: true } }),
      this.prisma.company.findMany({ select: { id: true } }),
    ]);
    const live = new Set(companies.map((company) => company.id));

    return recorded.map((workspace) => workspace.companyId).filter((companyId) => !live.has(companyId));
  }

  @BypassTenantGuard
  async reconcileCompanyUnscoped(companyId: string): Promise<void> {
    await this.withCompanyTransaction(companyId, async () => {
      await this.ledger.recordSeats(companyId, "sweep");
      await this.ledger.recordChannels(companyId, "sweep");
    });
  }

  @BypassTenantGuard
  async closeMissingWorkspaceUnscoped(companyId: string): Promise<void> {
    await this.ledger.recordWorkspaceDeleted(companyId, "sweep");
  }
}
