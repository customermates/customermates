import type { RepoArgs } from "@/core/utils/types";

import { randomUUID } from "crypto";

import { getTranslations } from "next-intl/server";
import { CustomColumnType, EntityType, Status, SubscriptionPlan, SubscriptionStatus } from "@/generated/prisma";

import { FindUserRepo } from "./user.service";
import { type UserDto } from "./user.schema";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { RegisterUserRepo } from "@/features/user/register/register-user.interactor";
import { UpdateUserDetailsRepo } from "@/features/user/upsert/update-user-details.interactor";
import { UpdateUserSettingsRepo } from "@/features/user/upsert/update-user-settings.interactor";
import { AdminUpdateUserDetailsRepo } from "@/features/user/upsert/admin-update-user-details.interactor";
import { GetUserByIdRepo } from "@/features/user/get/get-user-by-id.interactor";
import { CheckAgentHealthRepo } from "@/ee/agent/check-agent-health.interactor";
import { DeleteApiKeyRepo } from "@/features/api-key/delete-api-key.interactor";
import { GetApiKeysRepo } from "@/features/api-key/get-api-keys.interactor";
import { GetAgentControlUrlRepo } from "@/ee/agent/get-agent-control-url.interactor";
import { GetAgentProvisionedRepo } from "@/ee/agent/get-agent-provisioned.interactor";
import { ProvisionAgentRepo } from "@/ee/agent/provision-agent.interactor";
import { ResetAgentRepo } from "@/ee/agent/reset-agent.interactor";
import { VerifyAgentMachineRepo } from "@/ee/agent/verify-agent-machine.interactor";
import { SendWelcomeAndDemoActionRepo } from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import { SendTrialExtensionOfferActionRepo } from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import { SendTrialInactivationReminderActionRepo } from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import { DeactivateTrialUsersAndSendNoticeRepo } from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import { DeactivateUsersAfterSubscriptionGracePeriodRepo } from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";
import { CleanupInactiveUsersResourcesActionRepo } from "@/ee/lifecycle/cleanup-inactive-users-resources.interactor";
import { CleanupNonProCompaniesResourcesRepo } from "@/ee/lifecycle/cleanup-non-pro-companies-resources.interactor";
import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Repository } from "@/core/decorators/repository.decorator";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { IS_CLOUD_HOSTED } from "@/constants/env";

@Repository
export class PrismaUserRepo
  extends BaseRepository
  implements
    FindUserRepo,
    GetUserByIdRepo,
    RegisterUserRepo,
    UpdateUserDetailsRepo,
    UpdateUserSettingsRepo,
    AdminUpdateUserDetailsRepo,
    DeleteApiKeyRepo,
    GetApiKeysRepo,
    ProvisionAgentRepo,
    CheckAgentHealthRepo,
    GetAgentControlUrlRepo,
    GetAgentProvisionedRepo,
    ResetAgentRepo,
    VerifyAgentMachineRepo,
    CleanupInactiveUsersResourcesActionRepo,
    CleanupNonProCompaniesResourcesRepo,
    SendWelcomeAndDemoActionRepo,
    SendTrialExtensionOfferActionRepo,
    SendTrialInactivationReminderActionRepo,
    DeactivateTrialUsersAndSendNoticeRepo,
    DeactivateUsersAfterSubscriptionGracePeriodRepo
{
  private get extendedUserSelect() {
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
      marketingEmails: true,
      flyMachineId: true,
      flyVolumeId: true,
      lastActiveAt: true,
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

  async getUserById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        ...this.accessWhere("user"),
      },
      select: this.userSelect,
    });

    return user satisfies UserDto | null;
  }

  @Transaction
  async updateSettings(args: RepoArgs<UpdateUserSettingsRepo, "updateSettings">) {
    const { id: userId } = this.user;

    const { companyId } = this.user;

    await this.prisma.user.updateMany({
      data: {
        theme: args.theme,
        displayLanguage: args.displayLanguage,
        formattingLocale: args.formattingLocale,
        marketingEmails: args.marketingEmails,
      },
      where: { id: userId, companyId },
    });

    return args;
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
      },
      where: { id: userId, companyId },
    });

    return args;
  }

  @Transaction
  async adminUpdateDetails(args: RepoArgs<AdminUpdateUserDetailsRepo, "adminUpdateDetails">) {
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
  }

  @Transaction
  async createCompanyAndUser(args: RepoArgs<RegisterUserRepo, "createCompanyAndUser">) {
    if (await this.prisma.user.findFirst({ where: { email: args.email } })) throw new Error("User already exists.");

    const company = await this.prisma.company.create({
      data: { country: args.country },
    });

    const adminRole = await this.prisma.userRole.create({
      data: {
        name: "Admin",
        description: "Full access to all features and settings",
        isSystemRole: true,
        companyId: company.id,
      },
    });

    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 3);

    await this.prisma.subscription.create({
      data: IS_CLOUD_HOSTED
        ? {
            companyId: company.id,
            status: SubscriptionStatus.trial,
            trialEndDate,
          }
        : {
            companyId: company.id,
            plan: SubscriptionPlan.basic,
            status: SubscriptionStatus.active,
            trialEndDate: null,
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
        marketingEmails: args.marketingEmails,
        roleId: adminRole.id,
      },
    });

    await this.createDefaultEntitiesAndCustomColumnsForNewUser(user, company);

    const extendedUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: this.extendedUserSelect,
    });

    return extendedUser;
  }

  private async createDefaultEntitiesAndCustomColumnsForNewUser(user: { id: string }, company: { id: string }) {
    const t = await getTranslations("Common");

    const [contact, organization, deal, service] = await Promise.all([
      this.prisma.contact.create({
        data: {
          firstName: t("defaultData.contact.firstName"),
          lastName: t("defaultData.contact.lastName"),
          companyId: company.id,
        },
      }),
      this.prisma.organization.create({
        data: {
          name: t("defaultData.organization.name"),
          companyId: company.id,
        },
      }),
      this.prisma.deal.create({
        data: {
          name: t("defaultData.deal.name"),
          companyId: company.id,
          totalValue: 1000,
          totalQuantity: 1,
        },
      }),
      this.prisma.service.create({
        data: {
          name: t("defaultData.service.name"),
          amount: 1000,
          companyId: company.id,
        },
      }),
    ]);

    await Promise.all([
      this.prisma.contactUser.create({
        data: {
          contactId: contact.id,
          userId: user.id,
          companyId: company.id,
        },
      }),
      this.prisma.contactOrganization.create({
        data: {
          contactId: contact.id,
          organizationId: organization.id,
          companyId: company.id,
        },
      }),
      this.prisma.organizationUser.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          companyId: company.id,
        },
      }),
      this.prisma.dealContact.create({
        data: {
          dealId: deal.id,
          contactId: contact.id,
          companyId: company.id,
        },
      }),
      this.prisma.dealOrganization.create({
        data: {
          dealId: deal.id,
          organizationId: organization.id,
          companyId: company.id,
        },
      }),
      this.prisma.dealUser.create({
        data: {
          dealId: deal.id,
          userId: user.id,
          companyId: company.id,
        },
      }),
      this.prisma.serviceDeal.create({
        data: {
          serviceId: service.id,
          dealId: deal.id,
          quantity: 1,
          companyId: company.id,
        },
      }),
      this.prisma.serviceUser.create({
        data: {
          serviceId: service.id,
          userId: user.id,
          companyId: company.id,
        },
      }),
    ]);

    await this.prisma.customColumn.create({
      data: {
        label: t("defaultData.todo.columnLabel"),
        type: CustomColumnType.singleSelect,
        entityType: EntityType.task,
        companyId: company.id,
        options: {
          options: [
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.open"),
              color: CHIP_COLORS[0],
              isDefault: true,
              index: 0,
            },
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.inProgress"),
              color: CHIP_COLORS[4],
              isDefault: false,
              index: 1,
            },
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.blocked"),
              color: CHIP_COLORS[5],
              isDefault: false,
              index: 2,
            },
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.onHold"),
              color: CHIP_COLORS[2],
              isDefault: false,
              index: 3,
            },
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.done"),
              color: CHIP_COLORS[3],
              isDefault: false,
              index: 4,
            },
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.archived"),
              color: CHIP_COLORS[0],
              isDefault: false,
              index: 5,
            },
          ],
        },
      },
    });
  }

  @Transaction
  async registerExistingCompany(args: RepoArgs<RegisterUserRepo, "registerExistingCompany">) {
    if (await this.prisma.user.findFirst({ where: { email: args.email, companyId: args.companyId } }))
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
        marketingEmails: args.marketingEmails,
      },
    });

    const extendedUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: this.extendedUserSelect,
    });

    return extendedUser;
  }

  async findOrThrow(email: string) {
    const { companyId } = this.user;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { email, companyId },
      select: this.extendedUserSelect,
    });

    return user;
  }

  @BypassTenantGuard
  async findCurrentUserOrThrow(email: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { email },
      select: this.extendedUserSelect,
    });

    return user;
  }

  @BypassTenantGuard
  async findCurrentUser(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: this.extendedUserSelect,
    });

    return user;
  }

  @BypassTenantGuard
  async findCompanyId(userId: string) {
    const authUser = await this.prisma.authUser.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    return authUser?.companyId ?? null;
  }

  async getCrmApiKeyId() {
    const { id, companyId } = this.user;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id, companyId },
      select: { crmApiKeyId: true },
    });

    return user?.crmApiKeyId ?? null;
  }

  async getMachineIds() {
    const { id, companyId } = this.user;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id, companyId },
      select: { flyMachineId: true, flyVolumeId: true },
    });

    return { machineId: user.flyMachineId, volumeId: user.flyVolumeId };
  }

  async getMachineIdsOrThrow() {
    const { machineId, volumeId } = await this.getMachineIds();

    if (!machineId || !volumeId) throw new Error("No agent provisioned for this user");

    return { machineId, volumeId };
  }

  async verifyProPlanOrThrow() {
    const { companyId } = this.user;

    await this.prisma.subscription.findFirstOrThrow({
      where: {
        companyId,
        plan: SubscriptionPlan.pro,
      },
      select: { companyId: true },
    });
  }

  async storeMachineIds(machineId: string, volumeId: string) {
    const { id, companyId } = this.user;

    await this.prisma.user.update({
      where: { id, companyId },
      data: { flyMachineId: machineId, flyVolumeId: volumeId },
    });
  }

  async getMachineId() {
    const { id, companyId } = this.user;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id, companyId },
      select: { flyMachineId: true },
    });

    return user?.flyMachineId ?? null;
  }

  async getMachineIdOrThrow() {
    const machineId = await this.getMachineId();

    if (!machineId) throw new Error("No agent provisioned for this user");

    return machineId;
  }

  async getAgentGatewayToken() {
    const { id, companyId } = this.user;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id, companyId },
      select: { agentGatewayToken: true },
    });

    return user?.agentGatewayToken ?? null;
  }

  async getAgentGatewayTokenOrThrow() {
    const gatewayToken = await this.getAgentGatewayToken();

    if (!gatewayToken) throw new Error("No agent gateway token for this user");

    return gatewayToken;
  }

  async clearMachineIds() {
    const { id, companyId } = this.user;

    await this.prisma.user.update({
      where: { id, companyId },
      data: { flyMachineId: null, flyVolumeId: null },
    });
  }

  @BypassTenantGuard
  async clearMachineIdsForUser(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        flyMachineId: null,
        flyVolumeId: null,
        agentGatewayToken: null,
        agentHooksToken: null,
      },
    });
  }

  @BypassTenantGuard
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

  @BypassTenantGuard
  async findActiveUsersInactiveFor24HoursWithMachine() {
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return await this.prisma.user.findMany({
      where: {
        status: Status.active,
        lastActiveAt: { lte: before },
        flyMachineId: { not: null },
      },
    });
  }

  @BypassTenantGuard
  async findInactiveUsersPast3DaysForCleanup() {
    const now = Date.now();
    const before = new Date(now - 3 * 24 * 60 * 60 * 1000);

    return await this.prisma.user.findMany({
      where: {
        status: Status.inactive,
        updatedAt: { lte: before },
        OR: [{ flyMachineId: { not: null } }, { flyVolumeId: { not: null } }],
      },
    });
  }

  @BypassTenantGuard
  async findUsersWithResourcesOutsideProPlan() {
    return await this.prisma.user.findMany({
      where: {
        OR: [{ flyMachineId: { not: null } }, { flyVolumeId: { not: null } }],
        company: {
          OR: [{ subscription: { is: null } }, { subscription: { is: { plan: { not: SubscriptionPlan.pro } } } }],
        },
      },
    });
  }

  @BypassTenantGuard
  async findUsersWithTrialEndedLast24Hours() {
    const now = Date.now();
    const from = new Date(now - 24 * 60 * 60 * 1000);
    const to = new Date(now);

    return await this.findUsersWithTrialEndDateBetween(from, to);
  }

  @BypassTenantGuard
  async findUsersWithTrialEndedBetween3And4Days() {
    const now = Date.now();
    const from = new Date(now - 4 * 24 * 60 * 60 * 1000);
    const to = new Date(now - 3 * 24 * 60 * 60 * 1000);

    return await this.findUsersWithTrialEndDateBetween(from, to);
  }

  @BypassTenantGuard
  async findUsersWithTrialEndedBetween6And7Days() {
    const now = Date.now();
    const from = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(now - 6 * 24 * 60 * 60 * 1000);

    return await this.findUsersWithTrialEndDateBetween(from, to);
  }

  @BypassTenantGuard
  async findUsersPastSubscriptionGracePeriod() {
    const before = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    return await this.prisma.user.findMany({
      where: {
        status: { not: Status.inactive },
        company: {
          subscription: {
            status: { in: [SubscriptionStatus.unPaid, SubscriptionStatus.expired] },
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

  @BypassTenantGuard
  async claimWelcomeEmailSent(userId: string, sentAt: Date) {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, welcomeEmailSentAt: null },
      data: { welcomeEmailSentAt: sentAt },
    });

    return result.count > 0;
  }

  @BypassTenantGuard
  async claimTrialExpiredOfferSent(userId: string, sentAt: Date) {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, trialExpiredOfferSentAt: null },
      data: { trialExpiredOfferSentAt: sentAt },
    });

    return result.count > 0;
  }

  @BypassTenantGuard
  async claimTrialInactivationReminderSent(userId: string, sentAt: Date) {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, trialInactivationReminderSentAt: null },
      data: { trialInactivationReminderSentAt: sentAt },
    });

    return result.count > 0;
  }

  @BypassTenantGuard
  async claimTrialInactivationNoticeSent(userId: string, sentAt: Date) {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, trialInactivationNoticeSentAt: null },
      data: { trialInactivationNoticeSentAt: sentAt },
    });

    return result.count > 0;
  }

  @BypassTenantGuard
  async deactivateUser(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: Status.inactive },
    });
  }

  async getCrmApiKey() {
    const { id, companyId } = this.user;

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id, companyId },
      select: { crmApiKey: true },
    });

    return user?.crmApiKey ?? null;
  }

  async storeCrmApiKey(keyId: string, key: string) {
    const { id, companyId } = this.user;

    await this.prisma.user.update({
      where: { id, companyId },
      data: { crmApiKeyId: keyId, crmApiKey: key },
    });
  }

  async storeAgentTokens(gatewayToken: string, hooksToken: string) {
    const { id, companyId } = this.user;

    await this.prisma.user.update({
      where: { id, companyId },
      data: { agentGatewayToken: gatewayToken, agentHooksToken: hooksToken },
    });
  }
}
