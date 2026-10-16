import type { PermissionService } from "@/core/base/permission.service";
import type { RecordMemberRepo } from "./record-member.repo";
import type { RepoArgs } from "@/core/utils/types";
import type { GetOnboardingWizardProgressRepo } from "@/features/onboarding-wizard/get-onboarding-wizard-progress.repo";
import type { SaveOnboardingWizardProgressRepo } from "@/features/onboarding-wizard/save-onboarding-wizard-progress.repo";
import type { CompleteOnboardingWikiStepRepo } from "@/features/onboarding-wizard/complete-onboarding-wiki-step.repo";
import type { DeactivateTrialUsersAndSendNoticeRepo } from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import type { DeactivateUsersAfterSubscriptionGracePeriodRepo } from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";
import type { ExpireAdAttributionRepo } from "@/ee/lifecycle/expire-ad-attribution.interactor";
import type { SendLegalDocumentNoticesRepo } from "@/ee/lifecycle/send-legal-document-notices.interactor";
import type { SendTrialExtensionOfferActionRepo } from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import type { SendTrialInactivationReminderActionRepo } from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import type { SendWelcomeAndDemoActionRepo } from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import type { DeleteAccountsForPlanUserRepo } from "@/ee/messaging/connect/delete-accounts-for-plan-user.repo";
import type { WebhookUserRepo } from "@/ee/messaging/webhooks/account/account-webhook.repo";
import type { WithdrawAdAttributionRepo } from "@/features/acquisition/withdraw-ad-attribution.interactor";
import type { CompleteOnboardingWizardRepo } from "@/features/onboarding-wizard/complete-onboarding-wizard.interactor";
import type { FindUsersByIdsRepo } from "@/features/user/find-users-by-ids.repo";
import type { FindUserSummariesRepo } from "@/features/user/find-user-summaries.repo";
import type { GetUserByIdRepo } from "@/features/user/get/get-user-by-id.repo";
import type { GetUsersRepo } from "@/features/user/get/get-users.repo";
import type { RegisterUserRepo } from "@/features/user/register/register-user.repo";
import type { AdminUpdateUserDetailsRepo } from "@/features/user/upsert/admin-update-user-details.repo";
import type { UpdateUserDetailsRepo } from "@/features/user/upsert/update-user-details.repo";
import type { Prisma } from "@/generated/prisma";
import type { CountActiveUsersRepo } from "./count-active-users.repo";
import type { ResolveUserOptionsRepo } from "./get/resolve-user-options.repo";
import type { FindUserRepo } from "./find-user.repo";

import { Status, SubscriptionStatus } from "@/generated/prisma";

import { type UserDto } from "./user.schema";

import { type GetQueryParams } from "@/core/base/base-get.schema";
import { QueryRepository } from "@/core/base/query-repository";
import { userAccessWhere } from "./user-access";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FILTER_FIELD_DEFAULT_OPERATORS } from "@/core/types/filter-field-operators";
import { BillingUsageLedger } from "@/features/billing-usage/billing-usage-ledger";

function recordActorSelect(companyId: string) {
  return {
    id: true,
    status: true,
    role: {
      select: {
        id: true,
        companyId: true,
        isSystemRole: true,
        permissions: { where: { companyId }, select: { resource: true, action: true } },
      },
    },
  } as const;
}

export class PrismaUserRepo
  extends QueryRepository
  implements
    FindUserRepo,
    GetUsersRepo,
    FindUsersByIdsRepo,
    FindUserSummariesRepo,
    GetUserByIdRepo,
    ResolveUserOptionsRepo,
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
    GetOnboardingWizardProgressRepo,
    SaveOnboardingWizardProgressRepo,
    CompleteOnboardingWikiStepRepo,
    WebhookUserRepo,
    SendLegalDocumentNoticesRepo,
    ExpireAdAttributionRepo,
    WithdrawAdAttributionRepo,
    RecordMemberRepo
{
  private readonly billingUsage = new BillingUsageLedger();

  constructor(private readonly permissions: PermissionService) {
    super();
  }

  async setOperatorStatusCompanyWide(
    companyId: string,
    userId: string,
    status: Status,
    agentCreditActivatedAt?: Date | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId, companyId },
      data: { status, ...(agentCreditActivatedAt === undefined ? {} : { agentCreditActivatedAt }) },
    });
    await this.billingUsage.recordSeats(companyId);
  }

  async setPlatformOperatorCompanyWide(companyId: string, userId: string, isPlatformOperator: boolean): Promise<void> {
    await this.prisma.user.update({ where: { id: userId, companyId }, data: { isPlatformOperator } });
  }

  @BypassTenantGuard
  async deleteAuthIdentitiesUnscoped(identityIds: string[]): Promise<void> {
    await this.prisma.authUser.deleteMany({ where: { id: { in: identityIds } } });
  }

  @BypassTenantGuard
  async detachAuthIdentitiesFromCompanyUnscoped(companyId: string): Promise<number> {
    const cleared = await this.prisma.authUser.updateMany({ where: { companyId }, data: { companyId: null } });
    return cleared.count;
  }

  @BypassTenantGuard
  async markActiveByEmailUnscoped(email: string): Promise<void> {
    await this.prisma.user.updateMany({ where: { email }, data: { lastActiveAt: new Date() } });
  }

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
      onboardingWikiStepCompletedAt: true,
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
      { field: "name", resolvedFields: ["firstName", "lastName"], collate: true },
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
    return this.list({
      model: "user",
      baseWhere: userAccessWhere(this.permissions),
      select: this.userSelect,
      params,
      map: (user: Prisma.UserGetPayload<{ select: PrismaUserRepo["userSelect"] }>) => user,
    });
  }

  async getCount(params: GetQueryParams) {
    const { where } = await this.buildQueryArgs(params, userAccessWhere(this.permissions));

    return await this.prisma.user.count({ where });
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const users = await this.prisma.user.findMany({
      where: {
        ...userAccessWhere(this.permissions),
        AND: [{ id: { in: Array.from(ids) } }],
      },
      select: { id: true },
    });

    return new Set(users.map((user) => user.id));
  }

  resolveUserOptions(ids: string[]) {
    return this.prisma.user.findMany({
      where: { ...userAccessWhere(this.permissions), AND: [{ id: { in: ids } }] },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
      take: 100,
    });
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        ...userAccessWhere(this.permissions),
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
    await this.billingUsage.recordSeats(companyId);

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

  async findOnboardingWizardProgressOrThrow() {
    const { id, companyId } = this.user;
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id, companyId },
      select: { onboardingWizardProgress: true },
    });
    return user.onboardingWizardProgress;
  }

  async saveOnboardingWizardProgress(
    progress: RepoArgs<SaveOnboardingWizardProgressRepo, "saveOnboardingWizardProgress">,
  ) {
    const { id, companyId } = this.user;
    const result = await this.prisma.user.updateMany({
      where: {
        id,
        companyId,
        status: Status.active,
        onboardingWizardCompletedAt: null,
      },
      data: { onboardingWizardProgress: progress },
    });
    return result.count === 1;
  }

  async markOnboardingWikiStepCompleted(
    args: RepoArgs<CompleteOnboardingWikiStepRepo, "markOnboardingWikiStepCompleted">,
  ) {
    const { companyId } = this.user;
    await this.prisma.user.updateMany({
      data: { onboardingWikiStepCompletedAt: new Date() },
      where: {
        id: args.userId,
        companyId,
        onboardingWikiStepCompletedAt: null,
      },
    });
  }

  @Transaction
  async adminUpdateDetailsOrThrow(args: RepoArgs<AdminUpdateUserDetailsRepo, "adminUpdateDetailsOrThrow">) {
    const { companyId } = this.user;

    await this.prisma.user.update({
      data: {
        firstName: args.firstName,
        lastName: args.lastName,
        status: args.status,
        avatarUrl: args.avatarUrl,
        country: args.country,
        roleId: args.roleId,
      },
      where: { id: args.userId, companyId },
    });
    await this.billingUsage.recordSeats(companyId);
  }

  async createCompanyOwnerOrThrow(args: RepoArgs<RegisterUserRepo, "createCompanyOwnerOrThrow">) {
    if (await this.prisma.user.findFirst({ where: { email: args.email } })) throw new Error("User already exists.");

    const user = await this.prisma.user.create({
      data: {
        agreeToTerms: args.agreeToTerms,
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        avatarUrl: args.avatarUrl,
        country: args.country,
        status: Status.active,
        companyId: args.companyId,
        roleId: args.roleId,
        lastActiveAt: new Date(),
        agentCreditActivatedAt: new Date(),
      },
    });
    await this.billingUsage.recordSeats(args.companyId);

    for (const attribution of args.adAttribution ?? []) {
      await this.prisma.adAttribution.create({
        data: {
          companyId: args.companyId,
          userId: user.id,
          provider: attribution.provider,
          identifierKind: attribution.identifierKind,
          identifierValue: attribution.identifierValue,
          clickedAt: attribution.clickedAt,
          capturedAt: attribution.capturedAt,
          consentedAt: attribution.consentedAt,
          consentNoticeVersion: attribution.consentNoticeVersion,
          expiresAt: attribution.expiresAt,
        },
      });
    }

    const tenantUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: this.tenantUserSelect,
    });

    return { user: tenantUser, createdAt: user.createdAt };
  }

  async clearAdAttributionForUser(args: { userId: string }) {
    const result = await this.prisma.adAttribution.deleteMany({
      where: { userId: args.userId, companyId: this.companyId },
    });
    return result.count > 0;
  }

  @BypassTenantGuard
  async expireAdAttributionUnscoped(now: Date) {
    const result = await this.prisma.adAttribution.deleteMany({ where: { expiresAt: { lte: now } } });
    return result.count;
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

  async isPlatformOperatorCompanyWide(userId: string) {
    const { companyId } = this.user;

    const user = await this.prisma.user.findUnique({
      where: { id: userId, companyId },
      select: { isPlatformOperator: true },
    });

    return user?.isPlatformOperator ?? false;
  }

  async findUserSummaries(userIds: string[]) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { companyId: this.user.companyId, id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });
    return new Map(users.map((user) => [user.id, user]));
  }

  async findMemberCompanyWide(reference: { id: string } | { email: string }) {
    return this.prisma.user.findFirst({
      where: { ...reference, companyId: this.user.companyId },
      select: this.tenantUserSelect,
    });
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
  async findAuthUserCompanyIdUnscoped(userId: string) {
    const authUser = await this.prisma.authUser.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    return authUser?.companyId;
  }

  @BypassTenantGuard
  async findAuthUserCompanyIdForUpdateUnscoped(userId: string) {
    const [authUser] = await this.prisma.$queryRaw<Array<{ companyId: string | null }>>`
      SELECT "companyId"
      FROM "AuthUser"
      WHERE id = ${userId}
      FOR UPDATE
    `;
    return authUser?.companyId;
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

  @Transaction
  async markAgentCreditActivatedOrThrow(userId: string) {
    const { companyId } = this.user;

    await this.prisma.user.update({
      where: { id: userId, companyId },
      data: { agentCreditActivatedAt: new Date() },
    });
  }

  @Transaction
  async clearAgentCreditActivatedOrThrow(userId: string) {
    const { companyId } = this.user;

    await this.prisma.user.update({
      where: { id: userId, companyId },
      data: { agentCreditActivatedAt: null },
    });
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
      await this.billingUsage.recordSeats(companyId);
    });
  }

  @BypassTenantGuard
  async bindAuthUserToCompanyOrThrowUnscoped(args: { authUserId: string; companyId: string }) {
    await this.prisma.authUser.update({
      where: { id: args.authUserId },
      data: { companyId: args.companyId },
    });
  }

  @BypassTenantGuard
  async findAuthUserAccountStateUnscoped(userId: string) {
    const authUser = await this.prisma.authUser.findUnique({
      where: { id: userId },
      select: { companyId: true, emailVerified: true },
    });
    return authUser ?? undefined;
  }

  async getCurrentRecordActorCompanyWide() {
    return this.prisma.user.findFirst({
      where: { companyId: this.companyId, id: this.user.id },
      select: recordActorSelect(this.companyId),
    });
  }

  @BypassTenantGuard
  async findRecordActorUnscoped(companyId: string, userId: string) {
    return this.prisma.user.findFirst({
      where: { companyId, id: userId, status: Status.active, role: { companyId } },
      select: recordActorSelect(companyId),
    });
  }

  async getRecordMemberCompanyWide(userId: string) {
    return this.prisma.user.findFirst({
      where: { companyId: this.companyId, id: userId },
      select: { id: true, email: true, status: true },
    });
  }

  async findRecordAssigneesCompanyWide(ids: string[]) {
    const users = await this.prisma.user.findMany({
      where: { companyId: this.companyId, id: { in: ids }, status: Status.active },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  async getRecordMembersCompanyWide(companyId: string, userIds: string[]) {
    return this.prisma.user.findMany({
      where: { companyId, id: { in: [...new Set(userIds)] } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true },
    });
  }
}
