import type { RepoArgs } from "@/core/utils/types";

import { Prisma } from "@/generated/prisma";

import { GetWidgetsRepo } from "./get-widgets.interactor";
import { UpsertWidgetRepo } from "./upsert-widget.interactor";
import { DeleteWidgetRepo } from "./delete-widget.interactor";
import { GetCompanyWidgetsRepo } from "./get-company-widgets.interactor";
import { GetWidgetByIdRepo } from "./get-widget-by-id.interactor";
import { UpdateWidgetLayoutsRepo, type UpdateWidgetLayoutsData } from "./update-widget-layouts.interactor";
import { RecalculateUserWidgetsRepo } from "./widget.service";
import { ExtendedWidget, WidgetLayout } from "./widget.types";
import { PrismaWidgetCalculatorRepo } from "./calculator/prisma-widget-calculator.repository";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { Repository } from "@/core/decorators/repository.decorator";
import { BREAKPOINTS } from "@/constants/breakpoints";
import { di } from "@/core/dependency-injection/container";

@Repository
export class PrismaWidgetRepo
  extends BaseRepository
  implements
    GetWidgetsRepo,
    UpsertWidgetRepo,
    DeleteWidgetRepo,
    GetCompanyWidgetsRepo,
    GetWidgetByIdRepo,
    UpdateWidgetLayoutsRepo,
    RecalculateUserWidgetsRepo
{
  private get calculatorRepo() {
    return di.get(PrismaWidgetCalculatorRepo);
  }

  async getWidgets() {
    const { id: userId, companyId } = this.user;

    const widgets = (await this.prisma.widget.findMany({
      where: {
        userId,
        companyId,
      },
    })) as unknown as ExtendedWidget[];

    return widgets;
  }

  @Transaction
  async upsertWidget(data: RepoArgs<UpsertWidgetRepo, "upsertWidget">) {
    const { id: userId, companyId } = this.user;
    const { data: widgetData } = data;

    const widgetDataForDb: Prisma.WidgetUncheckedCreateInput = {
      userId,
      companyId,
      name: widgetData.name,
      entityType: widgetData.entityType,
      entityFilters: widgetData.entityFilters ?? Prisma.JsonNull,
      dealFilters: widgetData.dealFilters ?? Prisma.JsonNull,
      displayOptions: widgetData.displayOptions ?? Prisma.JsonNull,
      groupByType: widgetData.groupByType ?? null,
      groupByCustomColumnId: widgetData.groupByCustomColumnId ?? null,
      aggregationType: widgetData.aggregationType,
      isTemplate: widgetData.isTemplate,
    };

    const widget = (await this.prisma.widget.upsert({
      where: { id: widgetData.id ?? "", companyId },
      create: widgetDataForDb,
      update: widgetDataForDb,
    })) as unknown as ExtendedWidget;

    const calculatedData = await this.calculatorRepo.calculateWidgetData(widget);

    await this.prisma.widget.update({
      where: { id: widget.id, companyId },
      data: { data: calculatedData as Prisma.InputJsonValue },
    });

    return { ...widget, data: calculatedData };
  }

  @Transaction
  async deleteWidget(id: string) {
    const { companyId } = this.user;

    await this.prisma.widget.deleteMany({ where: { id, companyId } });
  }

  async getCompanyWidgets() {
    const { companyId } = this.user;

    const widgets = await this.prisma.widget.findMany({
      where: {
        companyId,
        isTemplate: true,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return widgets.map((widget) => ({
      id: widget.id,
      name: widget.name,
      firstName: widget.user.firstName,
      lastName: widget.user.lastName,
      avatarUrl: widget.user.avatarUrl,
    }));
  }

  async getWidgetById(id: string) {
    const { companyId } = this.user;

    const widget = (await this.prisma.widget.findFirst({
      where: {
        id,
        companyId,
      },
    })) as unknown as ExtendedWidget | null;

    return widget;
  }

  @Transaction
  async updateWidgetLayouts(args: UpdateWidgetLayoutsData): Promise<void> {
    const { companyId } = this.user;
    const widgetIds = new Set<string>();

    BREAKPOINTS.forEach((breakpoint) => args.layouts[breakpoint].forEach((layoutItem) => widgetIds.add(layoutItem.i)));

    const widgets = await this.prisma.widget.findMany({
      where: {
        id: { in: Array.from(widgetIds) },
        companyId,
      },
    });

    await Promise.all(
      widgets.map((widget) => {
        const widgetLayout: WidgetLayout = {
          xs: args.layouts.xs.find((l) => l.i === widget.id),
          sm: args.layouts.sm.find((l) => l.i === widget.id),
          md: args.layouts.md.find((l) => l.i === widget.id),
          lg: args.layouts.lg.find((l) => l.i === widget.id),
        };

        return this.prisma.widget.update({
          where: { id: widget.id, companyId },
          data: { layout: widgetLayout },
        });
      }),
    );
  }

  async recalculateUserWidgets(): Promise<void> {
    const { companyId, id: userId } = this.user;

    const widgets = (await this.prisma.widget.findMany({
      where: { companyId, userId },
    })) as unknown as ExtendedWidget[];

    await Promise.all(
      widgets.map(async (widget) => {
        const data = await this.calculatorRepo.calculateWidgetData(widget);

        await this.prisma.widget.updateMany({
          where: { id: widget.id, companyId },
          data: { data, companyId },
        });
      }),
    );
  }
}
