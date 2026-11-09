import type { FunnelEventInput, OnboardingFunnelRepo, OnboardingJobChoice } from "./onboarding-funnel.repo";
import type { OnboardingJob } from "./onboarding-job";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";

export class PrismaOnboardingFunnelRepo extends TenantRepository implements OnboardingFunnelRepo {
  recordFunnelEvent(event: FunnelEventInput) {
    return this.insertOnce(this.user.companyId, event);
  }

  @BypassTenantGuard
  recordFunnelEventUnscoped({ companyId, ...event }: FunnelEventInput & { companyId: string }) {
    return this.insertOnce(companyId, event);
  }

  async findOnboardingJobChoice(): Promise<OnboardingJobChoice> {
    const { companyId } = this.user;
    const [selectedJob, source] = await Promise.all([
      this.selectedJob(companyId),
      this.prisma.companySignupSource.findFirst({ where: { companyId }, select: { job: true, landingPath: true } }),
    ]);
    return { selectedJob, signupJob: source?.job ?? null, signupLandingPath: source?.landingPath ?? null };
  }

  private async insertOnce(companyId: string, { type, occurredAt, job }: FunnelEventInput): Promise<boolean> {
    const existing = await this.prisma.companyFunnelEvent.findFirst({
      where: { companyId, type },
      select: { id: true, job: true },
    });
    if (existing) {
      if (type === "jobSelected" && job && existing.job !== job)
        await this.prisma.companyFunnelEvent.updateMany({ where: { id: existing.id, companyId }, data: { job } });
      return false;
    }
    const { count } = await this.prisma.companyFunnelEvent.createMany({
      data: [{ companyId, type, occurredAt, job: job ?? (await this.selectedJob(companyId)) }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  private async selectedJob(companyId: string): Promise<OnboardingJob | null> {
    const row = await this.prisma.companyFunnelEvent.findFirst({
      where: { companyId, type: "jobSelected" },
      select: { job: true },
    });
    return row?.job ?? null;
  }
}
