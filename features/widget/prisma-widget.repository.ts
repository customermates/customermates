import type { RepoArgs } from "@/core/utils/types";
import type { GetWidgetsRepo } from "./get-widgets.interactor";
import type { UpsertWidgetRepo } from "./upsert-widget.interactor";
import type { DeleteWidgetRepo } from "./delete-widget.interactor";
import type { GetCompanyWidgetsRepo } from "./get-company-widgets.interactor";
import type { GetWidgetByIdRepo } from "./get-widget-by-id.interactor";
import type { UpdateWidgetLayoutsRepo } from "./update-widget-layouts.interactor";
import type { FindWidgetsByIdsRepo } from "./find-widgets-by-ids.repo";
import type { WidgetDisplayOptions, WidgetDto, WidgetLayout } from "./widget.schema";
import type { Filter } from "@/core/base/base-get.schema";

import { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BREAKPOINTS } from "@/constants/breakpoints";
import { getWidgetCalculatorRepo } from "@/core/di";

export class PrismaWidgetRepo
  extends BaseRepository
  implements
    GetWidgetsRepo,
    UpsertWidgetRepo,
    DeleteWidgetRepo,
    GetCompanyWidgetsRepo,
    GetWidgetByIdRepo,
    UpdateWidgetLayoutsRepo,
    FindWidgetsByIdsRepo
{
  private get dtoSelect() {
    return {
      id: true,
      userId: true,
      companyId: true,
      name: true,
      entityType: true,
      entityFilters: true,
      dealFilters: true,
      displayOptions: true,
      groupByType: true,
      groupByCustomColumnId: true,
      aggregationType: true,
      layout: true,
      isTemplate: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private async toDto(row: Prisma.WidgetGetPayload<{ select: PrismaWidgetRepo["dtoSelect"] }>): Promise<WidgetDto> {
    const widget = {
      ...row,
      entityFilters: (row.entityFilters as unknown as Filter[] | null) ?? [],
      dealFilters: (row.dealFilters as unknown as Filter[] | null) ?? [],
      displayOptions: (row.displayOptions as unknown as WidgetDisplayOptions | null) ?? null,
      layout: (row.layout as unknown as WidgetLayout | null) ?? null,
    };

    return { ...widget, data: await getWidgetCalculatorRepo().calculateWidgetData(widget) };
  }

  async getWidgets() {
    const { id: userId, companyId } = this.user;

    const rows = await this.prisma.widget.findMany({
      where: {
        userId,
        companyId,
      },
      select: this.dtoSelect,
    });

    return Promise.all(rows.map((row) => this.toDto(row)));
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
      entityFilters: widgetData.entityFilters ?? [],
      dealFilters: widgetData.dealFilters ?? [],
      displayOptions: widgetData.displayOptions ?? Prisma.JsonNull,
      groupByType: widgetData.groupByType ?? null,
      groupByCustomColumnId: widgetData.groupByCustomColumnId ?? null,
      aggregationType: widgetData.aggregationType,
      isTemplate: widgetData.isTemplate,
    };

    const row = await this.prisma.widget.upsert({
      where: { id: widgetData.id ?? "", companyId, userId },
      create: widgetDataForDb,
      update: widgetDataForDb,
      select: this.dtoSelect,
    });

    return this.toDto(row);
  }

  @Transaction
  async deleteWidget(id: string) {
    const { id: userId, companyId } = this.user;

    await this.prisma.widget.deleteMany({ where: { id, companyId, userId } });
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const { id: userId, companyId } = this.user;

    const widgets = await this.prisma.widget.findMany({
      where: { id: { in: Array.from(ids) }, companyId, userId },
      select: { id: true },
    });

    return new Set(widgets.map((widget) => widget.id));
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

    const row = await this.prisma.widget.findFirst({
      where: {
        id,
        companyId,
      },
      select: this.dtoSelect,
    });

    return row ? this.toDto(row) : null;
  }

  @Transaction
  async updateWidgetLayouts(args: RepoArgs<UpdateWidgetLayoutsRepo, "updateWidgetLayouts">) {
    const { id: userId, companyId } = this.user;
    const widgetIds = new Set<string>();

    BREAKPOINTS.forEach((breakpoint) => args.layouts[breakpoint].forEach((layoutItem) => widgetIds.add(layoutItem.i)));

    const widgets = await this.prisma.widget.findMany({
      where: {
        id: { in: Array.from(widgetIds) },
        companyId,
        userId,
      },
      select: { id: true },
    });

    await Promise.all(
      widgets.map((widget) => {
        const layout: WidgetLayout = {
          xs: args.layouts.xs.find((l) => l.i === widget.id),
          sm: args.layouts.sm.find((l) => l.i === widget.id),
          md: args.layouts.md.find((l) => l.i === widget.id),
          lg: args.layouts.lg.find((l) => l.i === widget.id),
        };

        return this.prisma.widget.update({
          where: { id: widget.id, companyId, userId },
          data: { layout },
        });
      }),
    );
  }
}
