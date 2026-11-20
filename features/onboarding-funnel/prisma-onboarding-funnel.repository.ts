import type {
  FunnelEventInput,
  OnboardingFunnelRepo,
  OnboardingJobChoice,
  OnboardingTemplateChoice,
} from "./onboarding-funnel.repo";
import type { OnboardingAgentStatus, OnboardingAgentStatusRepo } from "./onboarding-agent.repo";
import type { OnboardingJob } from "./onboarding-job";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { parseTeamSize } from "./team-size";

export class PrismaOnboardingFunnelRepo
  extends TenantRepository
  implements OnboardingFunnelRepo, OnboardingAgentStatusRepo
{
  async findOnboardingAgentStatus(): Promise<OnboardingAgentStatus> {
    const { companyId } = this.user;
    const [company, schema] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { agentFirstCallAt: true } }),
      this.prisma.recordSchemaState.findUnique({ where: { companyId }, select: { revision: true } }),
    ]);
    return { connected: Boolean(company?.agentFirstCallAt), schemaRevision: schema?.revision ?? 0 };
  }

  recordFunnelEvent(event: FunnelEventInput) {
    return this.insertOnce(this.user.companyId, event);
  }

  @BypassTenantGuard
  recordFunnelEventUnscoped({ companyId, ...event }: FunnelEventInput & { companyId: string }) {
    return this.insertOnce(companyId, event);
  }

  async findOnboardingJobChoice(): Promise<OnboardingJobChoice> {
    const { companyId } = this.user;
    const [selectedJob, source, company] = await Promise.all([
      this.selectedJob(companyId),
      this.prisma.companySignupSource.findFirst({ where: { companyId }, select: { job: true, landingPath: true } }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { discoveryAnsweredAt: true, createdByAuthUserId: true, teamSize: true },
      }),
    ]);
    const discoveryResolved =
      Boolean(company?.discoveryAnsweredAt) ||
      (company?.createdByAuthUserId != null && (await this.hasAnsweredDiscoveryUnscoped(company.createdByAuthUserId)));
    return {
      selectedJob,
      signupJob: source?.job ?? null,
      signupLandingPath: source?.landingPath ?? null,
      discoveryResolved,
      teamSize: parseTeamSize(company?.teamSize),
    };
  }

  @BypassTenantGuard
  async hasAnsweredDiscoveryUnscoped(authUserId: string): Promise<boolean> {
    const answered = await this.prisma.company.count({
      where: { createdByAuthUserId: authUserId, discoveryAnsweredAt: { not: null } },
    });
    return answered > 0;
  }

  async findOnboardingTemplateChoice(): Promise<OnboardingTemplateChoice> {
    const { companyId } = this.user;
    const [company, source] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { signupTemplate: true } }),
      this.prisma.companySignupSource.findFirst({ where: { companyId }, select: { landingPath: true } }),
    ]);
    return { signupTemplate: company?.signupTemplate ?? null, signupLandingPath: source?.landingPath ?? null };
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
