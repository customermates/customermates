import type { RepoArgs } from "@/core/utils/types";

import { Status, Subscription, SubscriptionStatus } from "@/generated/prisma";

import { GetCompanyDetailsRepo } from "./get-company-details.interactor";
import { UpdateCompanyDetailsRepo } from "./update-company-details.interactor";
import { GetOrCreateInviteTokenRepo } from "./get-or-create-invite-token.interactor";

import { GetUsersRepo } from "@/features/user/get/get-users.interactor";
import { BaseRepository } from "@/core/base/base-repository";
import { InviteTokenRepo } from "@/features/company/invite-token-validation.interactor";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { Repository } from "@/core/decorators/repository.decorator";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { FindUsersByIdsRepo } from "@/features/user/find-users-by-ids.repo";
import { SubscriptionRepo } from "@/ee/subscription/subscription.service";
import { GetSubscriptionRepo } from "@/ee/subscription/get-subscription.interactor";
import { RefreshSubscriptionRepo } from "@/ee/subscription/refresh-subscription.interactor";
import { AdminUpdateUserSubscriptionRepo } from "@/features/user/upsert/admin-update-user-details.interactor";
import { CreateCheckoutCompanyRepo } from "@/ee/subscription/create-checkout-session.interactor";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";

@Repository
export class PrismaCompanyRepo
  extends BaseRepository
  implements
    GetCompanyDetailsRepo,
    UpdateCompanyDetailsRepo,
    GetUsersRepo,
    GetOrCreateInviteTokenRepo,
    InviteTokenRepo,
    FindUsersByIdsRepo,
    SubscriptionRepo,
    GetSubscriptionRepo,
    RefreshSubscriptionRepo,
    AdminUpdateUserSubscriptionRepo,
    CreateCheckoutCompanyRepo
{
  private get userSelect() {
    return {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      roleId: true,
      status: true,
      country: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  getSortableFields() {
    return [
      { field: "name", resolvedFields: ["firstName", "lastName"] },
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "updatedAt", resolvedFields: ["updatedAt"] },
    ];
  }

  getSearchableFields() {
    return [{ field: "firstName" }, { field: "lastName" }];
  }

  getFilterableFields() {
    return Promise.resolve([
      { field: FilterFieldKey.status, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.status] },
      { field: FilterFieldKey.updatedAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt] },
      { field: FilterFieldKey.createdAt, operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt] },
    ]);
  }

  async getItems(params: GetQueryParams) {
    const args = await this.buildQueryArgs(params, this.accessWhere("user"));

    const users = await this.prisma.user.findMany({
      ...args,
      select: this.userSelect,
    });

    return users;
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, this.accessWhere("user"));

    return await this.prisma.user.count({ where });
  }

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

  async findUnexpiredTokenForCompany() {
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
  async findToken(token: string) {
    return await this.prisma.inviteToken.findUnique({
      where: { token },
    });
  }

  @BypassTenantGuard
  async findTokenOrThrow(token: string) {
    const res = await this.prisma.inviteToken.findUniqueOrThrow({
      where: { token },
      include: { company: { select: { name: true } } },
    });

    return {
      ...res,
      companyName: res.company.name ?? "",
    };
  }

  async findIds(ids: Set<string>): Promise<Set<string>> {
    if (ids.size === 0) return new Set();

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: Array.from(ids) },
        ...this.accessWhere("user"),
      },
      select: { id: true },
    });

    return new Set(users.map((user) => user.id));
  }

  @Transaction
  @BypassTenantGuard
  async upsertSubscription(data: RepoArgs<SubscriptionRepo, "upsertSubscription">): Promise<void> {
    const payload = {
      companyId: data.companyId,
      lemonSqueezyId: data.lemonSqueezyId,
      lemonSqueezyVariantId: data.lemonSqueezyVariantId,
      plan: data.plan,
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

  @BypassTenantGuard
  async getSubscriptionOrThrow(companyId: string): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findUniqueOrThrow({
      where: { companyId },
    });

    return subscription;
  }

  async countActiveUsers(): Promise<number> {
    return await this.prisma.user.count({
      where: { companyId: this.user.companyId, status: Status.active },
    });
  }
}
