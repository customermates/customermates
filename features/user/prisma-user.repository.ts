import type { RepoArgs } from "@/core/utils/types";
import type { FindUserRepo } from "./user.service";
import type { GetUsersRepo } from "@/features/user/get/get-users.interactor";
import type { FindUsersByIdsRepo } from "@/features/user/find-users-by-ids.repo";
import type { RegisterUserRepo } from "@/features/user/register/register-user.interactor";
import type { UpdateUserDetailsRepo } from "@/features/user/upsert/update-user-details.interactor";
import type { AdminUpdateUserDetailsRepo } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { GetUserByIdRepo } from "@/features/user/get/get-user-by-id.interactor";
import type { CompleteOnboardingWizardRepo } from "@/features/onboarding-wizard/complete-onboarding-wizard.interactor";
import type { SendWelcomeAndDemoActionRepo } from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import type { DeleteAccountsForPlanUserRepo } from "@/ee/messaging/connect/delete-accounts-for-plan.interactor";
import type { CountActiveUsersRepo } from "./count-active-users.repo";
import type { SendTrialExtensionOfferActionRepo } from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import type { SendTrialInactivationReminderActionRepo } from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import type { DeactivateTrialUsersAndSendNoticeRepo } from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";
import type { DeactivateUsersAfterSubscriptionGracePeriodRepo } from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";
import type { WebhookUserRepo } from "@/ee/messaging/webhooks/account/account-webhook.repo";
import type { SendLegalDocumentNoticesRepo } from "@/ee/lifecycle/send-legal-document-notices.interactor";

import { randomUUID } from "node:crypto";

import { getTranslations } from "next-intl/server";
import { CustomColumnType, EntityType, Status, SubscriptionStatus } from "@/generated/prisma";

import { type UserDto } from "./user.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { type GetQueryParams } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { env } from "@/env";

type DefaultSelectColumn = {
  entityType: EntityType;
  options: { key: string; color: string; weight?: number }[];
};

const DEFAULT_SELECT_COLUMNS: DefaultSelectColumn[] = [
  {
    entityType: EntityType.contact,
    options: [
      { key: "new", color: "secondary" },
      { key: "contact", color: "info" },
      { key: "qualified", color: "info" },
      { key: "inProgress", color: "warning" },
      { key: "won", color: "success" },
      { key: "lost", color: "destructive" },
    ],
  },
  {
    entityType: EntityType.deal,
    options: [
      { key: "prospecting", color: "secondary", weight: 10 },
      { key: "qualification", color: "info", weight: 20 },
      { key: "demo", color: "info", weight: 40 },
      { key: "proposal", color: "warning", weight: 60 },
      { key: "negotiation", color: "warning", weight: 80 },
      { key: "won", color: "success", weight: 100 },
      { key: "lost", color: "destructive", weight: 0 },
    ],
  },
  {
    entityType: EntityType.task,
    options: [
      { key: "open", color: "secondary" },
      { key: "inProgress", color: "warning" },
      { key: "blocked", color: "destructive" },
      { key: "onHold", color: "secondary" },
      { key: "done", color: "success" },
      { key: "archived", color: "secondary" },
    ],
  },
] as const;

export class PrismaUserRepo
  extends BaseRepository
  implements
    FindUserRepo,
    GetUsersRepo,
    FindUsersByIdsRepo,
    GetUserByIdRepo,
    RegisterUserRepo,
    UpdateUserDetailsRepo,
    AdminUpdateUserDetailsRepo,
    SendWelcomeAndDemoActionRepo,
    SendTrialExtensionOfferActionRepo,
    SendTrialInactivationReminderActionRepo,
    DeactivateTrialUsersAndSendNoticeRepo,
    DeactivateUsersAfterSubscriptionGracePeriodRepo,
    DeleteAccountsForPlanUserRepo,
    CountActiveUsersRepo,
    CompleteOnboardingWizardRepo,
    WebhookUserRepo,
    SendLegalDocumentNoticesRepo
{
  @BypassTenantGuard
  async findUserByIdOrThrowUnscoped(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: this.tenantUserSelect,
    });
  }

  private get tenantUserSelect() {
    return {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      companyId: true,
      roleId: true,
      status: true,
      displayLanguage: true,
      formattingLocale: true,
      theme: true,
      country: true,
      avatarUrl: true,
      agreeToTerms: true,
      lastActiveAt: true,
      onboardingWizardCompletedAt: true,
      createdAt: true,
      updatedAt: true,
      role: {
        select: {
          id: true,
          name: true,
          description: true,
          isSystemRole: true,
          createdAt: true,
          updatedAt: true,
          permissions: {
            select: {
              id: true,
              resource: true,
              action: true,
            },
          },
        },
      },
    } as const;
  }

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
      {
        field: FilterFieldKey.status,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.status],
      },
      {
        field: FilterFieldKey.updatedAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.updatedAt],
      },
      {
        field: FilterFieldKey.createdAt,
        operators: FILTER_FIELD_DEFAULT_OPERATORS[FilterFieldKey.createdAt],
      },
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

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const users = await this.prisma.user.findMany({
      where: {
        ...this.accessWhere("user"),
        AND: [{ id: { in: Array.from(ids) } }],
      },
      select: { id: true },
    });

    return new Set(users.map((user) => user.id));
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        ...this.accessWhere("user"),
        AND: [{ id }],
      },
      select: this.userSelect,
    });

    return user satisfies UserDto | null;
  }

  @Transaction
  async updateDetails(args: RepoArgs<UpdateUserDetailsRepo, "updateDetails">) {
    const { id: userId, companyId } = this.user;

    await this.prisma.user.updateMany({
      data: {
        firstName: args.firstName,
        lastName: args.lastName,
        country: args.country,
        avatarUrl: args.avatarUrl,
        theme: args.theme,
        displayLanguage: args.displayLanguage,
        formattingLocale: args.formattingLocale,
      },
      where: { id: userId, companyId },
    });

    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId, companyId },
      select: {
        firstName: true,
        lastName: true,
        country: true,
        avatarUrl: true,
        theme: true,
        displayLanguage: true,
        formattingLocale: true,
      },
    });
  }

  @Transaction
  async markOnboardingWizardCompleted(args: RepoArgs<CompleteOnboardingWizardRepo, "markOnboardingWizardCompleted">) {
    const { companyId } = this.user;

    await this.prisma.user.updateMany({
      data: { onboardingWizardCompletedAt: new Date() },
      where: { id: args.userId, companyId },
    });
  }

  @Transaction
  async adminUpdateDetailsOrThrow(args: RepoArgs<AdminUpdateUserDetailsRepo, "adminUpdateDetailsOrThrow">) {
    const { companyId } = this.user;
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: args.userId, companyId },
      select: { status: true },
    });
    const activatedAt =
      args.status === Status.inactive
        ? null
        : current.status !== Status.active && args.status === Status.active
          ? new Date()
          : undefined;

    await this.prisma.user.update({
      data: {
        firstName: args.firstName,
        lastName: args.lastName,
        status: args.status,
        avatarUrl: args.avatarUrl,
        country: args.country,
        roleId: args.roleId,
        agentCreditActivatedAt: activatedAt,
      },
      where: { id: args.userId, companyId },
    });
  }

  private async createDefaultCustomColumns(companyId: string) {
    const t = await getTranslations();
    let dealColumnId: string | undefined;

    for (const column of DEFAULT_SELECT_COLUMNS) {
      const created = await this.prisma.customColumn.create({
        data: {
          label: t(`Common.defaultData.${column.entityType}.columnLabel`),
          type: CustomColumnType.singleSelect,
          entityType: column.entityType,
          companyId,
          options: {
            options: column.options.map((option, index) => ({
              value: randomUUID(),
              label: t(`Common.defaultData.${column.entityType}.options.${option.key}`),
              color: option.color,
              isDefault: index === 0,
              index,
              ...(option.weight === undefined ? {} : { weight: option.weight }),
            })),
          },
        },
      });

      if (column.entityType === EntityType.deal) dealColumnId = created.id;
    }

    return dealColumnId;
  }

  @Transaction
  async createCompanyAndUser(args: RepoArgs<RegisterUserRepo, "createCompanyAndUser">) {
    if (await this.prisma.user.findFirst({ where: { email: args.email } })) throw new Error("User already exists.");

    const company = await this.prisma.company.create({ data: {} });

    const dealWeightingColumnId = await this.createDefaultCustomColumns(company.id);

    if (dealWeightingColumnId)
      await this.prisma.company.update({ where: { id: company.id }, data: { dealWeightingColumnId } });

    const adminRole = await this.prisma.userRole.create({
      data: {
        name: "Admin",
        description: "Full access to all features and settings",
        isSystemRole: true,
        companyId: company.id,
      },
    });

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + CLOUD_TRIAL.days);

    await this.prisma.subscription.create({
      data:
        env.APP_MODE !== "self-hosted"
          ? {
              companyId: company.id,
              status: SubscriptionStatus.trial,
              plan: CLOUD_TRIAL.plan,
              trialEndDate,
              agentCreditAnchorAt: new Date(),
            }
          : {
              companyId: company.id,
              status: SubscriptionStatus.active,
              trialEndDate: null,
              agentCreditAnchorAt: new Date(),
            },
    });

    const user = await this.prisma.user.create({
      data: {
        agreeToTerms: args.agreeToTerms,
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        avatarUrl: args.avatarUrl,
        country: args.country,
        status: Status.active,
        companyId: company.id,
        roleId: adminRole.id,
        lastActiveAt: new Date(),
        agentCreditActivatedAt: new Date(),
      },
    });

    const tenantUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: this.tenantUserSelect,
    });

    return tenantUser;
  }

  @Transaction
  async registerExistingCompany(args: RepoArgs<RegisterUserRepo, "registerExistingCompany">) {
    if (
      await this.prisma.user.findFirst({
        where: { email: args.email, companyId: args.companyId },
      })
    )
      throw new Error("User already exists.");

    const user = await this.prisma.user.create({
      data: {
        agreeToTerms: args.agreeToTerms,
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        avatarUrl: args.avatarUrl,
        country: args.country,
        status: Status.pendingAuthorization,
        companyId: args.companyId,
        onboardingWizardCompletedAt: new Date(),
      },
    });

    const tenantUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: this.tenantUserSelect,
    });

    return tenantUser;
  }

  async findOrThrowCompanyWide(email: string) {
    const { companyId } = this.user;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { email, companyId },
      select: this.tenantUserSelect,
    });

    return user;
  }

  async findExistingEmailsCompanyWide(emails: Set<string>) {
    if (emails.size === 0) return new Set<string>();

    const { companyId } = this.user;

    const users = await this.prisma.user.findMany({
      where: { email: { in: Array.from(emails) }, companyId },
      select: { email: true },
    });

    return new Set(users.map((user) => user.email));
  }

  @BypassTenantGuard
  async findCurrentUserOrThrowUnscoped(email: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { email },
      select: this.tenantUserSelect,
    });

    return user;
  }

  @BypassTenantGuard
  async findCurrentUserUnscoped(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: this.tenantUserSelect,
    });

    return user;
  }

  @BypassTenantGuard
  async findCompanyIdUnscoped(userId: string) {
    const authUser = await this.prisma.authUser.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    return authUser?.companyId ?? null;
  }

  @BypassTenantGuard
  async findCompanyAdminsUnscoped(companyId: string) {
    return this.prisma.user.findMany({
      where: {
        companyId,
        status: { not: Status.inactive },
        role: { isSystemRole: true },
      },
      select: { id: true, email: true, firstName: true, displayLanguage: true },
    });
  }

  @BypassTenantGuard
  async findActiveLegalNoticeRecipientsUnscoped() {
    const users = await this.prisma.user.findMany({
      where: { status: Status.active },
      select: {
        id: true,
        companyId: true,
        createdAt: true,
        email: true,
        firstName: true,
        displayLanguage: true,
        formattingLocale: true,
        role: { select: { isSystemRole: true } },
      },
    });

    return users.map((user) => ({
      id: user.id,
      companyId: user.companyId,
      createdAt: user.createdAt,
      email: user.email,
      firstName: user.firstName,
      displayLanguage: user.displayLanguage,
      formattingLocale: user.formattingLocale,
      isSystemAdministrator: user.role?.isSystemRole === true,
    }));
  }

  async countActiveUsers() {
    return await this.prisma.user.count({
      where: { companyId: this.companyId, status: Status.active },
    });
  }

  async findProspectUsers() {
    const now = Date.now();
    const from = new Date(now - 24 * 60 * 60 * 1000);
    const to = new Date(now);

    return await this.prisma.user.findMany({
      where: {
        OR: [{ createdAt: { gt: from, lte: to } }, { welcomeEmailSentAt: null }],
        company: {
          subscription: {
            status: SubscriptionStatus.trial,
            OR: [{ trialEndDate: null }, { trialEndDate: { gt: new Date(now) } }],
          },
        },
      },
    });
  }

  async findUsersWithTrialEndedLast24Hours() {
    const now = Date.now();
    const from = new Date(now - 24 * 60 * 60 * 1000);
    const to = new Date(now);

    return await this.findUsersWithTrialEndDateBetween(from, to);
  }

  async findUsersWithTrialEndedBetween3And4Days() {
    const now = Date.now();
    const from = new Date(now - 4 * 24 * 60 * 60 * 1000);
    const to = new Date(now - 3 * 24 * 60 * 60 * 1000);

    return await this.findUsersWithTrialEndDateBetween(from, to);
  }

  async findUsersWithTrialEndedBetween6And7Days() {
    const now = Date.now();
    const from = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(now - 6 * 24 * 60 * 60 * 1000);

    return await this.findUsersWithTrialEndDateBetween(from, to);
  }

  async findUsersPastSubscriptionGracePeriod() {
    const before = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    return await this.prisma.user.findMany({
      where: {
        status: { not: Status.inactive },
        company: {
          subscription: {
            status: {
              in: [SubscriptionStatus.unPaid, SubscriptionStatus.expired],
            },
            updatedAt: { lte: before },
          },
        },
      },
    });
  }

  private async findUsersWithTrialEndDateBetween(from: Date, to: Date) {
    return await this.prisma.user.findMany({
      where: {
        status: { not: Status.inactive },
        company: {
          subscription: {
            status: SubscriptionStatus.trial,
            trialEndDate: { gt: from, lte: to },
          },
        },
      },
    });
  }

  async claimWelcomeEmailSent(args: { userId: string; sentAt: Date }) {
    const { userId, sentAt } = args;
    const result = await this.prisma.user.updateMany({
      where: { id: userId, welcomeEmailSentAt: null },
      data: { welcomeEmailSentAt: sentAt },
    });

    return result.count > 0;
  }

  async claimTrialExpiredOfferSent(args: { userId: string; sentAt: Date }) {
    const { userId, sentAt } = args;
    const result = await this.prisma.user.updateMany({
      where: { id: userId, trialExpiredOfferSentAt: null },
      data: { trialExpiredOfferSentAt: sentAt },
    });

    return result.count > 0;
  }

  async claimTrialInactivationReminderSent(args: { userId: string; sentAt: Date }) {
    const { userId, sentAt } = args;
    const result = await this.prisma.user.updateMany({
      where: { id: userId, trialInactivationReminderSentAt: null },
      data: { trialInactivationReminderSentAt: sentAt },
    });

    return result.count > 0;
  }

  async claimTrialInactivationNoticeSent(args: { userId: string; sentAt: Date }) {
    const { userId, sentAt } = args;
    const result = await this.prisma.user.updateMany({
      where: { id: userId, trialInactivationNoticeSentAt: null },
      data: { trialInactivationNoticeSentAt: sentAt },
    });

    return result.count > 0;
  }

  async deactivateUserOrThrow(userId: string) {
    const { companyId } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { companyId: true },
    });

    await this.withCompanyTransaction(companyId, async () => {
      await this.prisma.user.update({
        where: { id: userId, companyId },
        data: { status: Status.inactive, agentCreditActivatedAt: null },
      });
    });
  }
}
