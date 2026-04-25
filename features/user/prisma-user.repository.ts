import type { RepoArgs } from "@/core/utils/types";
import type { FindUserRepo } from "./user.service";
import type { RegisterUserRepo } from "@/features/user/register/register-user.interactor";
import type { UpdateUserDetailsRepo } from "@/features/user/upsert/update-user-details.interactor";
import type { UpdateUserSettingsRepo } from "@/features/user/upsert/update-user-settings.interactor";
import type { AdminUpdateUserDetailsRepo } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { GetUserByIdRepo } from "@/features/user/get/get-user-by-id.interactor";
import type { CompleteOnboardingWizardRepo } from "@/features/onboarding-wizard/complete-onboarding-wizard.interactor";
import type { SendWelcomeAndDemoActionRepo } from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import type { SendTrialExtensionOfferActionRepo } from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import type { SendTrialInactivationReminderActionRepo } from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import type { DeactivateTrialUsersAndSendNoticeRepo } from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import type { DeactivateUsersAfterSubscriptionGracePeriodRepo } from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";

import { randomUUID } from "crypto";

import { getTranslations } from "next-intl/server";
import { CustomColumnType, EntityType, Status, SubscriptionStatus } from "@/generated/prisma";

import { type UserDto } from "./user.schema";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { IS_CLOUD_HOSTED } from "@/constants/env";

export class PrismaUserRepo
  extends BaseRepository
  implements
    FindUserRepo,
    GetUserByIdRepo,
    RegisterUserRepo,
    UpdateUserDetailsRepo,
    UpdateUserSettingsRepo,
    AdminUpdateUserDetailsRepo,
    SendWelcomeAndDemoActionRepo,
    SendTrialExtensionOfferActionRepo,
    SendTrialInactivationReminderActionRepo,
    DeactivateTrialUsersAndSendNoticeRepo,
    DeactivateUsersAfterSubscriptionGracePeriodRepo,
    CompleteOnboardingWizardRepo
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

  async markOnboardingWizardCompleted(userId: string) {
    const { companyId } = this.user;
    await this.prisma.user.updateMany({
      data: { onboardingWizardCompletedAt: new Date() },
      where: { id: userId, companyId },
    });
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
              color: "secondary",
              isDefault: true,
              index: 0,
            },
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.inProgress"),
              color: "warning",
              isDefault: false,
              index: 1,
            },
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.blocked"),
              color: "destructive",
              isDefault: false,
              index: 2,
            },
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.onHold"),
              color: "secondary",
              isDefault: false,
              index: 3,
            },
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.done"),
              color: "success",
              isDefault: false,
              index: 4,
            },
            {
              value: randomUUID(),
              label: t("defaultData.todo.states.archived"),
              color: "secondary",
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
        onboardingWizardCompletedAt: new Date(),
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

  async findCompanyId(userId: string) {
    const authUser = await this.prisma.authUser.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });

    return authUser?.companyId ?? null;
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

  async claimWelcomeEmailSent(userId: string, sentAt: Date) {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, welcomeEmailSentAt: null },
      data: { welcomeEmailSentAt: sentAt },
    });

    return result.count > 0;
  }

  async claimTrialExpiredOfferSent(userId: string, sentAt: Date) {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, trialExpiredOfferSentAt: null },
      data: { trialExpiredOfferSentAt: sentAt },
    });

    return result.count > 0;
  }

  async claimTrialInactivationReminderSent(userId: string, sentAt: Date) {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, trialInactivationReminderSentAt: null },
      data: { trialInactivationReminderSentAt: sentAt },
    });

    return result.count > 0;
  }

  async claimTrialInactivationNoticeSent(userId: string, sentAt: Date) {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, trialInactivationNoticeSentAt: null },
      data: { trialInactivationNoticeSentAt: sentAt },
    });

    return result.count > 0;
  }

  async deactivateUser(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: Status.inactive },
    });
  }
}
