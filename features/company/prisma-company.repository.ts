import type { RepoArgs } from "@/core/utils/types";
import type { GetCompanyDetailsRepo } from "./get-company-details.interactor";
import type { UpdateCompanyDetailsRepo } from "./update-company-details.interactor";
import type { GetOrCreateInviteTokenRepo } from "./get-or-create-invite-token.interactor";
import type { InviteTokenRepo } from "@/features/company/invite-token-validation.interactor";
import type { SubscriptionRepo } from "@/ee/subscription/subscription.service";
import type { GetSubscriptionRepo } from "@/ee/subscription/get-subscription.interactor";
import type { RefreshSubscriptionRepo } from "@/ee/subscription/refresh-subscription.interactor";
import type { AdminUpdateUserSubscriptionRepo } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { CreateCheckoutCompanyRepo } from "@/ee/subscription/create-checkout-session.interactor";
import type { RouteGuardSubscriptionRepo } from "@/features/auth/route-guard.service";

import { Status, SubscriptionStatus } from "@/generated/prisma";

import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseRepository } from "@/core/base/base-repository";

export class PrismaCompanyRepo
  extends BaseRepository
  implements
    GetCompanyDetailsRepo,
    UpdateCompanyDetailsRepo,
    GetOrCreateInviteTokenRepo,
    InviteTokenRepo,
    SubscriptionRepo,
    GetSubscriptionRepo,
    RefreshSubscriptionRepo,
    AdminUpdateUserSubscriptionRepo,
    CreateCheckoutCompanyRepo,
    RouteGuardSubscriptionRepo
{
  @Transaction
  async updateDetails(args: RepoArgs<UpdateCompanyDetailsRepo, "updateDetails">) {
    const { companyId } = this.user;

    await this.prisma.company.update({
      data: { ...args, id: companyId },
      where: { id: companyId },
    });
  }

  async getDetails() {
    const { companyId } = this.user;
    return await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  async getCurrentCurrency() {
    const { companyId } = this.user;

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { currency: true },
    });

    return company.currency;
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

  async findTokenUnscoped(token: string) {
    const res = await this.prisma.inviteToken.findUnique({
      where: { token },
      include: { company: { select: { name: true } } },
    });

    if (!res) return null;

    return {
      ...res,
      companyName: res.company.name ?? "",
    };
  }

  @Transaction
  @BypassTenantGuard
  async upsertSubscriptionUnscoped(data: RepoArgs<SubscriptionRepo, "upsertSubscriptionUnscoped">) {
    const payload = {
      companyId: data.companyId,
      lemonSqueezyId: data.lemonSqueezyId,
      lemonSqueezyVariantId: data.lemonSqueezyVariantId,
      status: data.status ?? SubscriptionStatus.trial,
      quantity: data.quantity,
      trialEndDate: data.trialEndDate,
      currentPeriodEnd: data.currentPeriodEnd,
    };

    await this.prisma.subscription.upsert({
      where: { companyId: data.companyId },
      create: payload,
      update: payload,
    });
  }

  async getSubscriptionOrThrow() {
    return this.prisma.subscription.findUniqueOrThrow({
      where: { companyId: this.companyId },
    });
  }

  @BypassTenantGuard
  async getSubscriptionOrThrowUnscoped(companyId: string) {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({
      where: { companyId },
    });

    return subscription;
  }

  async countActiveUsers() {
    return await this.prisma.user.count({
      where: { companyId: this.companyId, status: Status.active },
    });
  }
}
