import type { RepoArgs } from "@/core/utils/types";
import type { FindUserRepo } from "./user.service";
import type { RegisterUserRepo } from "@/features/user/register/register-user.interactor";
import type { UpdateUserDetailsRepo } from "@/features/user/upsert/update-user-details.interactor";
import type { UpdateUserSettingsRepo } from "@/features/user/upsert/update-user-settings.interactor";
import type { AdminUpdateUserDetailsRepo } from "@/features/user/upsert/admin-update-user-details.interactor";
import type { GetUserByIdRepo } from "@/features/user/get/get-user-by-id.interactor";
import type { CompleteOnboardingWizardRepo } from "@/features/onboarding-wizard/complete-onboarding-wizard.interactor";
import type { SeedOnboardingDataRepo } from "@/features/onboarding-wizard/seed-onboarding-data.interactor";
import type { SendWelcomeAndDemoActionRepo } from "@/ee/lifecycle/send-welcome-and-demo.interactor";
import type { SendTrialExtensionOfferActionRepo } from "@/ee/lifecycle/send-trial-extension-offer.interactor";
import type { SendTrialInactivationReminderActionRepo } from "@/ee/lifecycle/send-trial-inactivation-reminder.interactor";
import type { DeactivateTrialUsersAndSendNoticeRepo } from "@/ee/lifecycle/deactivate-trial-users-and-send-notice.interactor";
import type { DeactivateUsersAfterSubscriptionGracePeriodRepo } from "@/ee/lifecycle/deactivate-users-after-subscription-grace-period.interactor";

import { randomUUID } from "crypto";

import { getTranslations } from "next-intl/server";
import {
  AggregationType,
  CustomColumnType,
  EntityType,
  SalesType,
  Status,
  SubscriptionStatus,
  TaskType,
  WidgetGroupByType,
} from "@/generated/prisma";

import { type UserDto } from "./user.schema";

import { ChartColor, DisplayType } from "@/features/widget/widget.types";
import { getSeedData, PIPELINE_STAGES, type StageKey } from "@/features/onboarding-wizard/seed-data";
import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { env } from "@/env";

const TASK_STATUS_STATES = [
  { key: "open", color: "secondary", isDefault: true },
  { key: "inProgress", color: "warning", isDefault: false },
  { key: "blocked", color: "destructive", isDefault: false },
  { key: "onHold", color: "secondary", isDefault: false },
  { key: "done", color: "success", isDefault: false },
  { key: "archived", color: "secondary", isDefault: false },
] as const;

const STOCK_VALUE = { low: "5", mid: "40", high: "180" } as const;
const BILLABLE_HOURS_VALUE = { low: "10", mid: "60", high: "150" } as const;

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
    SeedOnboardingDataRepo,
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

  @Transaction
  async seedOnboardingData(args: { userId: string; salesType: SalesType; keepDemoData: boolean }) {
    const { companyId } = this.user;
    const { userId, salesType, keepDemoData } = args;

    await this.prisma.company.update({ where: { id: companyId }, data: { salesType } });

    if (!keepDemoData) return { alreadySeeded: false };

    return this.seedCompanyDashboard(userId, salesType);
  }

  @Transaction
  async markOnboardingWizardCompleted(args: { userId: string }) {
    const { companyId } = this.user;

    await this.prisma.user.updateMany({
      data: { onboardingWizardCompletedAt: new Date() },
      where: { id: args.userId, companyId },
    });
  }

  private async seedCompanyDashboard(userId: string, salesType: SalesType) {
    const { companyId } = this.user;

    const existingDeal = await this.prisma.deal.findFirst({ where: { companyId }, select: { id: true } });
    if (existingDeal) return { alreadySeeded: true };

    const t = await getTranslations("Common.seedData");
    const tCommon = await getTranslations("Common");
    const seed = getSeedData(salesType);

    const stageOptions = PIPELINE_STAGES.map((s) => ({
      value: randomUUID(),
      label: t(`pipeline.${s.key}`),
      color: s.color,
      isDefault: s.key === "new",
      index: s.index,
    }));
    const stageColumn = await this.prisma.customColumn.create({
      data: {
        label: t("column.salesPipeline"),
        type: CustomColumnType.singleSelect,
        entityType: EntityType.deal,
        companyId,
        options: { options: stageOptions },
      },
    });
    const stageValueByKey = Object.fromEntries(PIPELINE_STAGES.map((s, i) => [s.key, stageOptions[i].value])) as Record<
      StageKey,
      string
    >;

    const serviceExtraColumnIds = await this.createServiceExtraColumns(salesType, t);

    const taskStatusOptions = TASK_STATUS_STATES.map((s, index) => ({
      value: randomUUID(),
      label: tCommon(`defaultData.todo.states.${s.key}`),
      color: s.color,
      isDefault: s.isDefault,
      index,
    }));
    const taskStatusColumn = await this.prisma.customColumn.create({
      data: {
        label: tCommon("defaultData.todo.columnLabel"),
        type: CustomColumnType.singleSelect,
        entityType: EntityType.task,
        companyId,
        options: { options: taskStatusOptions },
      },
    });
    const taskStatusByKey = {
      open: taskStatusOptions[0].value,
      inProgress: taskStatusOptions[1].value,
      done: taskStatusOptions[4].value,
    };

    const ids = await this.createSeedEntities(userId, seed, t);

    const dealStageRows = seed.deals.map((deal) => ({
      companyId,
      columnId: stageColumn.id,
      entityType: EntityType.deal,
      type: CustomColumnType.singleSelect,
      value: stageValueByKey[deal.stage],
      dealId: ids.dealIdByKey[deal.key],
    }));

    const serviceExtraRows = seed.services.flatMap((service) => {
      const rows: Array<Record<string, unknown>> = [];
      if (service.productExtras && serviceExtraColumnIds.articleNumber && serviceExtraColumnIds.stock) {
        rows.push({
          companyId,
          columnId: serviceExtraColumnIds.articleNumber,
          entityType: EntityType.service,
          type: CustomColumnType.plain,
          value: service.productExtras.articleNumber,
          serviceId: ids.serviceIdByKey[service.key],
        });
        rows.push({
          companyId,
          columnId: serviceExtraColumnIds.stock,
          entityType: EntityType.service,
          type: CustomColumnType.plain,
          value: STOCK_VALUE[service.productExtras.stockKey],
          serviceId: ids.serviceIdByKey[service.key],
        });
      }
      if (service.serviceExtras && serviceExtraColumnIds.billableHours) {
        rows.push({
          companyId,
          columnId: serviceExtraColumnIds.billableHours,
          entityType: EntityType.service,
          type: CustomColumnType.plain,
          value: BILLABLE_HOURS_VALUE[service.serviceExtras.billableHoursKey],
          serviceId: ids.serviceIdByKey[service.key],
        });
      }
      return rows;
    });

    const taskStatusRows = seed.tasks.map((task) => ({
      companyId,
      columnId: taskStatusColumn.id,
      entityType: EntityType.task,
      type: CustomColumnType.singleSelect,
      value: taskStatusByKey[task.statusKey],
      taskId: ids.taskIdByKey[task.key],
    }));

    await this.prisma.customFieldValue.createMany({
      data: [...dealStageRows, ...serviceExtraRows, ...taskStatusRows] as never,
    });

    await this.createWidgetTemplates(userId, stageColumn.id, stageValueByKey, taskStatusColumn.id, t);

    return { alreadySeeded: false };
  }

  private async createServiceExtraColumns(
    salesType: SalesType,
    t: Awaited<ReturnType<typeof getTranslations<"Common.seedData">>>,
  ): Promise<{ articleNumber?: string; stock?: string; billableHours?: string }> {
    const { companyId } = this.user;

    if (salesType === SalesType.product) {
      const [articleNumber, stock] = await Promise.all([
        this.prisma.customColumn.create({
          data: {
            label: t("column.articleNumber"),
            type: CustomColumnType.plain,
            entityType: EntityType.service,
            companyId,
            options: {},
          },
        }),
        this.prisma.customColumn.create({
          data: {
            label: t("column.stock"),
            type: CustomColumnType.plain,
            entityType: EntityType.service,
            companyId,
            options: {},
          },
        }),
      ]);
      return { articleNumber: articleNumber.id, stock: stock.id };
    }

    const billableHours = await this.prisma.customColumn.create({
      data: {
        label: t("column.billableHours"),
        type: CustomColumnType.plain,
        entityType: EntityType.service,
        companyId,
        options: {},
      },
    });
    return { billableHours: billableHours.id };
  }

  private async createSeedEntities(
    userId: string,
    seed: ReturnType<typeof getSeedData>,
    t: Awaited<ReturnType<typeof getTranslations<"Common.seedData">>>,
  ) {
    const { companyId } = this.user;

    const orgIdByKey: Record<string, string> = {};
    for (const org of seed.organizations) {
      const created = await this.prisma.organization.create({
        data: { name: t(`organization.${org.nameKey}`), companyId },
      });
      orgIdByKey[org.key] = created.id;
      await this.prisma.organizationUser.create({ data: { organizationId: created.id, userId, companyId } });
    }

    const contactIdByKey: Record<string, string> = {};
    for (const contact of seed.contacts) {
      const created = await this.prisma.contact.create({
        data: {
          firstName: t(`contact.${contact.firstNameKey}`),
          lastName: t(`contact.${contact.lastNameKey}`),
          emails: [t(`contact.${contact.emailKey}`)],
          companyId,
        },
      });
      contactIdByKey[contact.key] = created.id;
      await this.prisma.contactUser.create({ data: { contactId: created.id, userId, companyId } });
      await this.prisma.contactOrganization.create({
        data: { contactId: created.id, organizationId: orgIdByKey[contact.orgKey], companyId },
      });
    }

    const serviceIdByKey: Record<string, string> = {};
    for (const service of seed.services) {
      const created = await this.prisma.service.create({
        data: { name: t(`service.${service.nameKey}`), amount: service.amount, companyId },
      });
      serviceIdByKey[service.key] = created.id;
      await this.prisma.serviceUser.create({ data: { serviceId: created.id, userId, companyId } });
    }

    const dealIdByKey: Record<string, string> = {};
    for (const deal of seed.deals) {
      const totalValue = deal.serviceLineItems.reduce((sum, item) => {
        const service = seed.services.find((s) => s.key === item.serviceKey);
        return sum + (service?.amount ?? 0) * item.quantity;
      }, 0);
      const totalQuantity = deal.serviceLineItems.reduce((sum, item) => sum + item.quantity, 0);

      const created = await this.prisma.deal.create({
        data: { name: t(`deal.${deal.nameKey}`), totalValue, totalQuantity, companyId },
      });
      dealIdByKey[deal.key] = created.id;

      await this.prisma.dealUser.create({ data: { dealId: created.id, userId, companyId } });
      await this.prisma.dealOrganization.create({
        data: { dealId: created.id, organizationId: orgIdByKey[deal.orgKey], companyId },
      });
      for (const contactKey of deal.contactKeys) {
        await this.prisma.dealContact.create({
          data: { dealId: created.id, contactId: contactIdByKey[contactKey], companyId },
        });
      }
      for (const item of deal.serviceLineItems) {
        await this.prisma.serviceDeal.create({
          data: { dealId: created.id, serviceId: serviceIdByKey[item.serviceKey], quantity: item.quantity, companyId },
        });
      }
    }

    const taskIdByKey: Record<string, string> = {};
    for (const task of seed.tasks) {
      const created = await this.prisma.task.create({
        data: { name: t(`task.${task.nameKey}`), type: TaskType.custom, companyId },
      });
      taskIdByKey[task.key] = created.id;
      await this.prisma.taskUser.create({ data: { taskId: created.id, userId, companyId } });

      for (const contactKey of task.contactKeys ?? []) {
        await this.prisma.taskContact.create({
          data: { taskId: created.id, contactId: contactIdByKey[contactKey], companyId },
        });
      }
      for (const orgKey of task.orgKeys ?? []) {
        await this.prisma.taskOrganization.create({
          data: { taskId: created.id, organizationId: orgIdByKey[orgKey], companyId },
        });
      }
      for (const dealKey of task.dealKeys ?? []) {
        await this.prisma.taskDeal.create({
          data: { taskId: created.id, dealId: dealIdByKey[dealKey], companyId },
        });
      }
      for (const serviceKey of task.serviceKeys ?? []) {
        await this.prisma.taskService.create({
          data: { taskId: created.id, serviceId: serviceIdByKey[serviceKey], companyId },
        });
      }
    }

    return { orgIdByKey, contactIdByKey, serviceIdByKey, dealIdByKey, taskIdByKey };
  }

  private async createWidgetTemplates(
    userId: string,
    stageColumnId: string,
    stageValueByKey: Record<StageKey, string>,
    taskStatusColumnId: string,
    t: Awaited<ReturnType<typeof getTranslations<"Common.seedData">>>,
  ) {
    const { companyId } = this.user;

    const stageColors: ChartColor[] = [
      ChartColor.secondary1,
      ChartColor.primary1,
      ChartColor.warning1,
      ChartColor.success1,
      ChartColor.danger1,
    ];

    const widgets = [
      {
        key: "dealsByStage",
        entityType: EntityType.deal,
        groupByType: WidgetGroupByType.customColumn,
        groupByCustomColumnId: stageColumnId,
        aggregationType: AggregationType.count,
        entityFilters: [],
        displayOptions: {
          displayType: DisplayType.doughnutChart,
          barColors: stageColors,
          reverseXAxis: false,
          reverseYAxis: false,
          useGroupColors: true,
        },
        layout: {
          lg: { w: 2, h: 2, x: 0, y: 0 },
          md: { w: 2, h: 2, x: 0, y: 0 },
          sm: { w: 2, h: 2, x: 0, y: 0 },
          xs: { w: 2, h: 2, x: 0, y: 0 },
        },
      },
      {
        key: "valueByStage",
        entityType: EntityType.deal,
        groupByType: WidgetGroupByType.customColumn,
        groupByCustomColumnId: stageColumnId,
        aggregationType: AggregationType.dealValue,
        entityFilters: [],
        displayOptions: {
          displayType: DisplayType.doughnutChart,
          barColors: stageColors,
          reverseXAxis: false,
          reverseYAxis: false,
          useGroupColors: true,
        },
        layout: {
          lg: { w: 2, h: 2, x: 2, y: 0 },
          md: { w: 2, h: 2, x: 2, y: 0 },
          sm: { w: 2, h: 2, x: 2, y: 0 },
          xs: { w: 2, h: 2, x: 0, y: 2 },
        },
      },
      {
        key: "valuePerService",
        entityType: EntityType.service,
        groupByType: WidgetGroupByType.service,
        groupByCustomColumnId: null,
        aggregationType: AggregationType.dealValue,
        entityFilters: [],
        displayOptions: {
          displayType: DisplayType.verticalBarChart,
          barColors: [ChartColor.primary1, ChartColor.primary2, ChartColor.primary3],
          reverseXAxis: false,
          reverseYAxis: false,
        },
        layout: {
          lg: { w: 4, h: 3, x: 4, y: 0 },
          md: { w: 4, h: 3, x: 0, y: 2 },
          sm: { w: 4, h: 3, x: 0, y: 4 },
          xs: { w: 2, h: 3, x: 0, y: 4 },
        },
      },
      {
        key: "activeDealsByStage",
        entityType: EntityType.deal,
        groupByType: WidgetGroupByType.customColumn,
        groupByCustomColumnId: stageColumnId,
        aggregationType: AggregationType.count,
        entityFilters: [{ field: stageColumnId, operator: "notIn", value: [stageValueByKey.lost] }],
        displayOptions: {
          displayType: DisplayType.radarChart,
          barColors: stageColors.slice(0, 4),
          reverseXAxis: false,
          reverseYAxis: false,
          useGroupColors: true,
        },
        layout: {
          lg: { w: 2, h: 2, x: 8, y: 0 },
          md: { w: 2, h: 2, x: 4, y: 0 },
          sm: { w: 2, h: 2, x: 0, y: 2 },
          xs: { w: 2, h: 2, x: 0, y: 7 },
        },
      },
      {
        key: "totalContacts",
        entityType: EntityType.contact,
        groupByType: WidgetGroupByType.none,
        groupByCustomColumnId: null,
        aggregationType: AggregationType.count,
        entityFilters: [],
        displayOptions: {
          displayType: DisplayType.doughnutChart,
          barColors: [ChartColor.default2],
          reverseXAxis: false,
          reverseYAxis: false,
        },
        layout: {
          lg: { w: 2, h: 2, x: 10, y: 0 },
          md: { w: 2, h: 2, x: 6, y: 0 },
          sm: { w: 2, h: 2, x: 2, y: 2 },
          xs: { w: 2, h: 2, x: 0, y: 9 },
        },
      },
      {
        key: "dealValueByOrg",
        entityType: EntityType.organization,
        groupByType: WidgetGroupByType.organization,
        groupByCustomColumnId: null,
        aggregationType: AggregationType.dealValue,
        entityFilters: [],
        displayOptions: {
          displayType: DisplayType.horizontalBarChartWithLabels,
          barColors: [ChartColor.secondary1, ChartColor.secondary2, ChartColor.secondary3],
          reverseXAxis: false,
          reverseYAxis: false,
        },
        layout: {
          lg: { w: 4, h: 3, x: 0, y: 2 },
          md: { w: 4, h: 3, x: 4, y: 2 },
          sm: { w: 4, h: 3, x: 0, y: 7 },
          xs: { w: 2, h: 3, x: 0, y: 11 },
        },
      },
      {
        key: "topDealsByValue",
        entityType: EntityType.deal,
        groupByType: WidgetGroupByType.deal,
        groupByCustomColumnId: null,
        aggregationType: AggregationType.dealValue,
        entityFilters: [],
        displayOptions: {
          displayType: DisplayType.horizontalBarChartWithLabels,
          barColors: [ChartColor.secondary1, ChartColor.secondary2, ChartColor.secondary3],
          reverseXAxis: false,
          reverseYAxis: false,
        },
        layout: {
          lg: { w: 4, h: 2, x: 4, y: 3 },
          md: { w: 4, h: 3, x: 0, y: 5 },
          sm: { w: 4, h: 2, x: 0, y: 10 },
          xs: { w: 2, h: 2, x: 0, y: 14 },
        },
      },
      {
        key: "tasksByStatus",
        entityType: EntityType.task,
        groupByType: WidgetGroupByType.customColumn,
        groupByCustomColumnId: taskStatusColumnId,
        aggregationType: AggregationType.count,
        entityFilters: [],
        displayOptions: {
          displayType: DisplayType.doughnutChart,
          barColors: [ChartColor.secondary1, ChartColor.warning1, ChartColor.success1],
          reverseXAxis: false,
          reverseYAxis: false,
          useGroupColors: true,
        },
        layout: {
          lg: { w: 4, h: 3, x: 8, y: 2 },
          md: { w: 4, h: 3, x: 4, y: 5 },
          sm: { w: 4, h: 3, x: 0, y: 13 },
          xs: { w: 2, h: 3, x: 0, y: 17 },
        },
      },
    ];

    for (const widget of widgets) {
      const id = randomUUID();
      await this.prisma.widget.create({
        data: {
          id,
          userId,
          companyId,
          name: t(`widget.${widget.key}`),
          entityType: widget.entityType,
          entityFilters: widget.entityFilters,
          dealFilters: [],
          displayOptions: widget.displayOptions,
          groupByType: widget.groupByType,
          groupByCustomColumnId: widget.groupByCustomColumnId,
          aggregationType: widget.aggregationType,
          layout: {
            lg: { i: id, ...widget.layout.lg },
            md: { i: id, ...widget.layout.md },
            sm: { i: id, ...widget.layout.sm },
            xs: { i: id, ...widget.layout.xs },
          },
          isTemplate: true,
        },
      });
    }
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
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    await this.prisma.subscription.create({
      data: env.CLOUD_HOSTED
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
        lastActiveAt: new Date(),
      },
    });

    const extendedUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: this.extendedUserSelect,
    });

    return extendedUser;
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

  async deactivateUser(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: Status.inactive },
    });
  }
}
