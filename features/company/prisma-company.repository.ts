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
import type { RouteGuardCompanyRepo } from "@/features/auth/route-guard-company.repo";
import type { InviteTokenRepo } from "@/features/company/invite-token-validation.repo";
import type { RegisterUserCompanyRepo } from "@/features/user/register/register-user-company.repo";
import type { AdminUpdateUserSubscriptionRepo } from "@/features/user/upsert/admin-update-user-subscription.repo";
import type { GetCompanyRepo } from "./get-company.repo";
import type { RenameWorkspaceRepo } from "@/features/workspace/rename-workspace.repo";
import type { GetOrCreateInviteTokenRepo } from "./get-or-create-invite-token.repo";

import { ConversionEventType, SubscriptionStatus, type Prisma, type Subscription } from "@/generated/prisma";

import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";
import { env } from "@/env";

import { TenantRepository } from "@/core/base/tenant-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";

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
    RegisterUserCompanyRepo
{
  async findCompanyOrThrow() {
    const { companyId } = this.user;
    return await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });
  }

  async renameCompany(name: string) {
    const { companyId } = this.user;
    await this.prisma.company.update({ where: { id: companyId }, data: { name } });
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
        where: { companyId, lemonSqueezyId: expectedLemonSqueezyId },
        data: fields,
      });
      if (count === 0) return false;

      if (fields.status !== SubscriptionStatus.active) return true;

      const attributed = await this.prisma.adAttribution.count({ where: { companyId } });
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
      company: { select: { name: true } },
    } satisfies Prisma.SubscriptionSelect;
  }

  private workspaceBilling({
    company,
    ...subscription
  }: Prisma.SubscriptionGetPayload<{ select: PrismaCompanyRepo["workspaceBillingSelect"] }>) {
    return { ...subscription, name: company.name };
  }

  async getSubscriptionOrThrow() {
    return this.prisma.subscription.findUniqueOrThrow({
      where: { companyId: this.companyId },
    });
  }

  async claimCheckoutStart(startedAt: Date, pendingSince: Date, lemonSqueezyId: string | null) {
    const { count } = await this.prisma.subscription.updateMany({
      where: {
        companyId: this.companyId,
        lemonSqueezyId,
        OR: [{ checkoutStartedAt: null }, { checkoutStartedAt: { lte: pendingSince } }],
      },
      data: { checkoutStartedAt: startedAt },
    });

    return count === 1;
  }

  async releaseCheckoutStart(startedAt: Date, previous: Date | null) {
    await this.prisma.subscription.updateMany({
      where: { companyId: this.companyId, checkoutStartedAt: startedAt },
      data: { checkoutStartedAt: previous },
    });
  }

  async clearCheckoutStart() {
    await this.prisma.subscription.updateMany({
      where: { companyId: this.companyId },
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
      select: { status: true, plan: true, lemonSqueezyId: true, trialEndDate: true, currentPeriodEnd: true },
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
    terms: { trialEndDate: Date | null; lemonSqueezyId: string | null },
  ): Promise<void> {
    await this.prisma.subscription.update({
      where: { companyId },
      data: {
        trialEndDate: terms.trialEndDate,
        lemonSqueezyId: terms.lemonSqueezyId,
        ...(terms.lemonSqueezyId === null ? { lemonSqueezyVariantId: null } : {}),
      },
    });
  }

  @BypassTenantGuard
  async setWorkspaceTagsUnscoped(companyId: string, tags: string[]): Promise<void> {
    await this.prisma.company.update({ where: { id: companyId }, data: { tags } });
  }

  @BypassTenantGuard
  async deleteInviteTokensByCreatorsUnscoped(creatorIds: string[]): Promise<void> {
    await this.prisma.inviteToken.deleteMany({ where: { createdById: { in: creatorIds } } });
  }

  @BypassTenantGuard
  async deleteCompanyUnscoped(companyId: string): Promise<void> {
    await this.prisma.company.delete({ where: { id: companyId } });
  }

  async createRegisteredCompany(setup: WorkspaceSetup = {}) {
    const company = await this.prisma.company.create({
      data: { name: setup.name ?? null, createdByAuthUserId: setup.createdByAuthUserId ?? null },
    });

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
