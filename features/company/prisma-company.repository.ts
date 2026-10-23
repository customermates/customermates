import type { WorkspaceSetup } from "@/features/user/register/register-user-company.repo";
import type { RepoArgs } from "@/core/utils/types";
import type { CreateAuthLinkSubscriptionRepo } from "@/ee/messaging/connect/create-auth-link-subscription.repo";
import type { UpsertRoutineSubscriptionRepo } from "@/ee/routines/upsert-routine-subscription.repo";
import type { AbandonCheckoutRepo } from "@/ee/subscription/abandon-checkout.repo";
import type { CreateCheckoutCompanyRepo } from "@/ee/subscription/create-checkout-session.repo";
import type { EntitlementSubscriptionRepo } from "@/ee/subscription/entitlement-subscription.repo";
import type { WorkspacePlanRepo } from "@/ee/subscription/workspace-plan.repo";
import type { GetBillingPortalUrlRepo } from "@/ee/subscription/get-billing-portal-url.repo";
import type { GetSubscriptionRepo } from "@/ee/subscription/get-subscription.repo";
import type { RefreshSubscriptionRepo } from "@/ee/subscription/refresh-subscription.repo";
import type { SubscriptionRepo } from "@/ee/subscription/subscription.repo";
import type { ProcessLemonSqueezyWebhookRepo } from "@/ee/subscription/process-lemon-squeezy-webhook.repo";
import type { BillingUsageRepo } from "@/features/billing-usage/billing-usage.repo";
import type { RouteGuardCompanyRepo } from "@/features/auth/route-guard-company.repo";
import type { InviteTokenRepo } from "@/features/company/invite-token-validation.repo";
import type { RegisterUserCompanyRepo } from "@/features/user/register/register-user-company.repo";
import type { AdminUpdateUserSubscriptionRepo } from "@/features/user/upsert/admin-update-user-subscription.repo";
import type { GetCompanyRepo } from "./get-company.repo";
import type { RenameWorkspaceRepo } from "@/features/workspace/rename-workspace.repo";
import type { WorkspaceDeletionRepo } from "@/features/workspace/workspace-deletion.repo";
import type { GetOrCreateInviteTokenRepo } from "./get-or-create-invite-token.repo";

import { ConversionEventType, SubscriptionStatus, type Prisma, type Subscription } from "@/generated/prisma";

import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";
import { workspaceDeletionMarkerCutoff } from "@/features/workspace/workspace-deletion-marker";
import { claimWorkspaceSlug } from "@/features/workspace/workspace-slug";
import { env } from "@/env";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { strandsLastPlatformOperator } from "@/features/user/platform-operator-logins";

const WORKFLOW_RUN_CHILD_TABLES = [
  "workflow_event_slots",
  "workflow_events",
  "workflow_hooks",
  "workflow_steps",
  "workflow_stream_chunks",
  "workflow_waits",
] as const;

export class PrismaCompanyRepo
  extends TenantRepository
  implements
    GetCompanyRepo,
    RenameWorkspaceRepo,
    GetOrCreateInviteTokenRepo,
    InviteTokenRepo,
    SubscriptionRepo,
    ProcessLemonSqueezyWebhookRepo,
    GetSubscriptionRepo,
    RefreshSubscriptionRepo,
    CreateCheckoutCompanyRepo,
    AbandonCheckoutRepo,
    GetBillingPortalUrlRepo,
    AdminUpdateUserSubscriptionRepo,
    RouteGuardCompanyRepo,
    EntitlementSubscriptionRepo,
    WorkspacePlanRepo,
    CreateAuthLinkSubscriptionRepo,
    UpsertRoutineSubscriptionRepo,
    RegisterUserCompanyRepo,
    WorkspaceDeletionRepo
{
  constructor(private readonly billingUsage: BillingUsageRepo) {
    super();
  }

  async findCompanyOrThrow() {
    const { companyId } = this.user;
    return await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
  }

  async renameCompany(name: string) {
    const { companyId } = this.user;
    await this.prisma.company.update({
      where: { id: companyId },
      data: { name },
    });
  }

  @Transaction
  async createInviteToken(data: RepoArgs<GetOrCreateInviteTokenRepo, "createInviteToken">) {
    const { id, companyId } = this.user;

    return await this.prisma.inviteToken.create({
      data: {
        token: data.token,
        companyId,
        createdById: id,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findUnexpiredToken() {
    const { companyId } = this.user;

    return await this.prisma.inviteToken.findFirst({
      where: {
        companyId,
        expiresAt: { gt: new Date() },
      },
      orderBy: {
        expiresAt: "desc",
      },
    });
  }

  @BypassTenantGuard
  async findTokenUnscoped(token: string) {
    return this.prisma.inviteToken.findUnique({
      where: { token },
      select: {
        companyId: true,
        company: { select: { name: true } },
        expiresAt: true,
        createdBy: { select: { email: true, firstName: true, lastName: true } },
      },
    });
  }

  @BypassTenantGuard
  async withSubscriptionCompanyLockUnscoped<T>(companyId: string, fn: () => Promise<T>) {
    return this.withCompanyTransaction(companyId, fn);
  }

  @BypassTenantGuard
  async writeSubscriptionUnscoped(data: RepoArgs<SubscriptionRepo, "writeSubscriptionUnscoped">) {
    const { companyId, expectedLemonSqueezyId, ...fields } = data;

    return await this.withCompanyTransaction(companyId, async () => {
      const { count } = await this.prisma.subscription.updateMany({
        where: {
          companyId,
          lemonSqueezyId: expectedLemonSqueezyId,
          company: this.notDeletingWhere(),
        },
        data: fields,
      });
      if (count === 0) return false;

      if (fields.status !== SubscriptionStatus.active) return true;

      const attributed = await this.prisma.adAttribution.count({
        where: { companyId },
      });
      if (attributed === 0) return true;

      await this.prisma.conversionEvent.createMany({
        data: [{ companyId, type: ConversionEventType.paid, occurredAt: new Date() }],
        skipDuplicates: true,
      });
      return true;
    });
  }

  @BypassTenantGuard
  async findWorkspaceBillingUnscoped(companyId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId },
      select: this.workspaceBillingSelect,
    });

    return subscription ? this.workspaceBilling(subscription) : null;
  }

  @BypassTenantGuard
  async findWorkspaceBillingBySubscriptionIdUnscoped(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { lemonSqueezyId: subscriptionId },
      select: this.workspaceBillingSelect,
    });

    return subscription ? this.workspaceBilling(subscription) : null;
  }

  private get workspaceBillingSelect() {
    return {
      companyId: true,
      status: true,
      plan: true,
      lemonSqueezyId: true,
      company: { select: { name: true, deletingAt: true } },
    } satisfies Prisma.SubscriptionSelect;
  }

  private workspaceBilling({
    company,
    ...subscription
  }: Prisma.SubscriptionGetPayload<{ select: PrismaCompanyRepo["workspaceBillingSelect"] }>) {
    return { ...subscription, name: company.name, deletingAt: company.deletingAt };
  }

  async getSubscriptionOrThrow() {
    return this.prisma.subscription.findUniqueOrThrow({
      where: { companyId: this.companyId },
    });
  }

  async claimCheckoutStart(args: RepoArgs<CreateCheckoutCompanyRepo, "claimCheckoutStart">) {
    const { startedAt, pendingSince, lemonSqueezyId, email } = args;
    const { companyId } = this;

    return await this.withCompanyTransaction(companyId, async () => {
      const deleting = await this.prisma.company.count({ where: { id: companyId, NOT: this.notDeletingWhere() } });
      if (deleting > 0) return "deleting" as const;

      const { count } = await this.prisma.subscription.updateMany({
        where: {
          companyId,
          lemonSqueezyId,
          OR: [{ checkoutStartedAt: null }, { checkoutStartedAt: { lte: pendingSince } }],
        },
        data: { checkoutStartedAt: startedAt, checkoutEmail: email },
      });

      return count === 1 ? ("claimed" as const) : ("pending" as const);
    });
  }

  private notDeletingWhere(): Prisma.CompanyWhereInput {
    return { OR: [{ deletingAt: null }, { deletingAt: { lte: workspaceDeletionMarkerCutoff() } }] };
  }

  async releaseCheckoutStart(args: RepoArgs<CreateCheckoutCompanyRepo, "releaseCheckoutStart">) {
    await this.prisma.subscription.updateMany({
      where: { companyId: this.companyId, checkoutStartedAt: args.startedAt },
      data: { checkoutStartedAt: args.previous },
    });
  }

  async clearCheckoutStart() {
    await this.prisma.subscription.updateMany({
      where: { companyId: this.companyId, checkoutStartedAt: { not: null } },
      data: { checkoutStartedAt: null },
    });
  }

  async findSubscription() {
    return this.prisma.subscription.findUnique({
      where: { companyId: this.companyId },
      select: { status: true, trialEndDate: true, plan: true },
    });
  }

  @BypassTenantGuard
  async findWorkspacePlanUnscoped(companyId: string) {
    return this.prisma.subscription.findUnique({
      where: { companyId },
      select: {
        status: true,
        plan: true,
        lemonSqueezyId: true,
        trialEndDate: true,
        currentPeriodEnd: true,
      },
    });
  }

  @BypassTenantGuard
  async getSubscriptionOrThrowUnscoped(companyId: string) {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({
      where: { companyId },
    });

    return subscription;
  }

  @BypassTenantGuard
  async correctSubscriptionSnapshotUnscoped(
    companyId: string,
    next: Pick<Subscription, "plan" | "status" | "quantity">,
  ): Promise<void> {
    await this.prisma.subscription.update({ where: { companyId }, data: next });
  }

  @BypassTenantGuard
  async setEnterpriseAgentCreditsUnscoped(companyId: string, creditsPerUser: number | null): Promise<void> {
    await this.prisma.subscription.update({
      where: { companyId },
      data: { enterpriseAgentCreditsPerUser: creditsPerUser },
    });
  }

  @BypassTenantGuard
  async setSubscriptionTermsUnscoped(
    companyId: string,
    terms: {
      trialEndDate: Date | null;
      lemonSqueezyId: string | null;
      status?: SubscriptionStatus;
    },
  ): Promise<void> {
    await this.prisma.subscription.update({
      where: { companyId },
      data: {
        trialEndDate: terms.trialEndDate,
        lemonSqueezyId: terms.lemonSqueezyId,
        ...(terms.lemonSqueezyId === null ? { lemonSqueezyVariantId: null } : {}),
        ...(terms.status ? { status: terms.status } : {}),
      },
    });
  }

  @BypassTenantGuard
  async setWorkspaceTagsUnscoped(companyId: string, tags: string[]): Promise<void> {
    await this.prisma.company.update({
      where: { id: companyId },
      data: { tags },
    });
  }

  @BypassTenantGuard
  async deleteInviteTokensByCreatorsUnscoped(creatorIds: string[]): Promise<void> {
    await this.prisma.inviteToken.deleteMany({
      where: { createdById: { in: creatorIds } },
    });
  }

  @BypassTenantGuard
  async deleteCompanyUnscoped(companyId: string): Promise<void> {
    await this.billingUsage.recordWorkspaceDeleted(companyId, "deleted");
    await this.prisma.company.delete({ where: { id: companyId } });
  }

  @BypassTenantGuard
  async findDeletionSubjectUnscoped(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        createdByAuthUserId: true,
        deletingAt: true,
        subscription: {
          select: {
            status: true,
            plan: true,
            lemonSqueezyId: true,
            currentPeriodEnd: true,
            checkoutStartedAt: true,
            checkoutEmail: true,
          },
        },
        users: {
          where: { role: { isSystemRole: true } },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { email: true },
        },
      },
    });
    if (!company) return null;

    return {
      name: company.name,
      createdByAuthUserId: company.createdByAuthUserId,
      deletingAt: company.deletingAt,
      earliestAdminEmail: company.users[0]?.email ?? null,
      strandsLastPlatformOperator: await strandsLastPlatformOperator(this.prisma, { companyId }),
      subscription: company.subscription,
    };
  }

  @BypassTenantGuard
  async markDeletingUnscoped(companyId: string, at: Date): Promise<void> {
    await this.prisma.company.update({ where: { id: companyId }, data: { deletingAt: at } });
  }

  @BypassTenantGuard
  async clearDeletingUnscoped(companyId: string, at: Date): Promise<void> {
    await this.prisma.company.updateMany({ where: { id: companyId, deletingAt: at }, data: { deletingAt: null } });
  }

  @BypassTenantGuard
  async deleteWorkflowRunsUnscoped(companyId: string): Promise<number> {
    const [workflowSchema] = await this.prisma.$queryRaw<Array<{ installed: boolean }>>`
      SELECT to_regclass('workflow.workflow_runs') IS NOT NULL AS installed
    `;
    if (!workflowSchema?.installed) return 0;

    const workflowRuns = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "workflow"."workflow_runs"
      WHERE "input"->>'companyId' = ${companyId}
         OR "input"->'tenant'->>'companyId' = ${companyId}
    `;
    const workflowRunIds = workflowRuns.map((run) => run.id);
    if (workflowRunIds.length === 0) return 0;

    for (const table of WORKFLOW_RUN_CHILD_TABLES) {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM "workflow"."${table}" WHERE "run_id" = ANY($1::text[])`,
        workflowRunIds,
      );
    }
    await this.prisma.$executeRaw`
      DELETE FROM "workflow"."workflow_runs" WHERE "id" = ANY(${workflowRunIds}::text[])
    `;
    return workflowRunIds.length;
  }

  async createRegisteredCompany(setup: WorkspaceSetup = {}) {
    const company = { id: crypto.randomUUID() };
    await claimWorkspaceSlug(setup.name, async (slug) => {
      const { count } = await this.prisma.company.createMany({
        data: [
          {
            id: company.id,
            name: setup.name ?? null,
            slug,
            createdByAuthUserId: setup.createdByAuthUserId ?? null,
          },
        ],
        skipDuplicates: true,
      });
      return count === 1;
    });
    await this.billingUsage.recordWorkspaceCreated(company.id);

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + CLOUD_TRIAL.days);

    await this.prisma.subscription.create({
      data:
        env.APP_MODE === "self-hosted"
          ? {
              companyId: company.id,
              status: SubscriptionStatus.active,
              trialEndDate: null,
              agentCreditAnchorAt: new Date(),
            }
          : setup.trial === false
            ? {
                companyId: company.id,
                status: SubscriptionStatus.expired,
                plan: CLOUD_TRIAL.plan,
                trialEndDate: null,
                agentCreditAnchorAt: new Date(),
              }
            : {
                companyId: company.id,
                status: SubscriptionStatus.trial,
                plan: CLOUD_TRIAL.plan,
                trialEndDate,
                agentCreditAnchorAt: new Date(),
              },
    });

    return company.id;
  }

  async recordSignupConversion(companyId: string, occurredAt: Date) {
    await this.prisma.conversionEvent.create({
      data: { companyId, type: ConversionEventType.signup, occurredAt },
    });
  }

  @BypassTenantGuard
  async existsUnscoped(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    return Boolean(company);
  }
}
