import { runInTransaction } from "@/core/decorators/transaction-runner";
import deepEqual from "fast-deep-equal";
import { recordJson } from "@/features/records/record-storage";
import type { RepoArgs } from "@/core/utils/types";
import type { DeleteWidgetRepo } from "./delete-widget.repo";
import type { FindWidgetsByIdsRepo } from "./find-widgets-by-ids.repo";
import type { GetCompanyWidgetsRepo } from "./get-company-widgets.interactor";
import type { GetWidgetByIdRepo } from "./get-widget-by-id.interactor";
import type { GetWidgetsRepo } from "./get-widgets.repo";
import { RecordActivityWidgetDtoSchema } from "./record-activity-widget.schema";
import { RecordWidgetDtoSchema } from "./record-widget.schema";
import type { UpdateWidgetLayoutsRepo } from "./update-widget-layouts.repo";
import type { WidgetDto, WidgetLayout } from "./widget.schema";

import type { Prisma } from "@/generated/prisma";
import { WidgetKind } from "@/generated/prisma";

import { BREAKPOINTS } from "@/constants/breakpoints";
import { TenantRepository } from "@/core/base/tenant-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { getRecordActivityWidgetReader, getRecordWidgetReader } from "@/core/di";
import { LIVE_WIDGET } from "./live-widget";

export class PrismaWidgetRepo
  extends TenantRepository
  implements
    GetWidgetsRepo,
    DeleteWidgetRepo,
    GetCompanyWidgetsRepo,
    GetWidgetByIdRepo,
    UpdateWidgetLayoutsRepo,
    FindWidgetsByIdsRepo
{
  constructor(private readonly scopedCompanyId?: string) {
    super();
  }

  override get companyId(): string {
    return this.scopedCompanyId ?? super.companyId;
  }

  private get dtoSelect() {
    return {
      id: true,
      userId: true,
      companyId: true,
      name: true,
      kind: true,
      measure: true,
      activityQuery: true,
      version: true,
      displayOptions: true,
      layout: true,
      viewId: true,
      isTemplate: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private async toDto(
    row: Prisma.WidgetGetPayload<{ select: PrismaWidgetRepo["dtoSelect"] }>,
  ): Promise<WidgetDto | null> {
    if (row.kind === WidgetKind.activityTimeline && row.activityQuery) {
      const stored = RecordActivityWidgetDtoSchema.omit({ schemaRevision: true, data: true, status: true })
        .strip()
        .parse({ ...row, viewId: row.userId === this.user.id ? row.viewId : null });
      return getRecordActivityWidgetReader().read(stored);
    }
    if (row.measure !== null && row.measure !== undefined) {
      const stored = RecordWidgetDtoSchema.omit({ data: true, status: true, groupOptions: true })
        .strip()
        .parse({
          ...row,
          viewId: row.userId === this.user.id ? row.viewId : null,
        });
      return getRecordWidgetReader().read(stored);
    }
    throw new Error(`Widget ${row.id} has no record definition`);
  }

  async getWidgets(viewId?: string | null) {
    return runInTransaction(
      async () => {
        const { id: userId, companyId } = this.user;

        const rows = await this.prisma.widget.findMany({
          where: {
            userId,
            companyId,
            ...(viewId === undefined ? {} : { viewId }),
            ...LIVE_WIDGET,
          },
          select: this.dtoSelect,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });

        const widgets = await Promise.all(rows.map((row) => this.toDto(row)));
        return widgets.filter((widget): widget is WidgetDto => widget !== null);
      },
      { readOnly: true, timeout: 30000 },
    );
  }

  @Transaction
  async trashWidget(id: string) {
    const { id: userId, companyId } = this.user;
    const widget = await this.prisma.widget.findFirst({
      where: { id, companyId, userId, ...LIVE_WIDGET },
      select: { name: true },
    });
    if (!widget) return null;
    await this.prisma.widget.updateMany({ where: { id, companyId, userId }, data: { deletedAt: new Date() } });
    return widget;
  }

  async restoreTrashed(ids: string[]) {
    const rows = await this.prisma.widget.findMany({
      where: { id: { in: ids }, companyId: this.companyId, deletedAt: { not: null } },
      select: { id: true },
    });
    const restored = rows.map((row) => row.id);
    await this.prisma.widget.updateMany({
      where: { id: { in: restored }, companyId: this.companyId },
      data: { deletedAt: null },
    });
    return restored;
  }

  async purgeTrashed(ids: string[]) {
    await this.prisma.widget.deleteMany({
      where: { id: { in: ids }, companyId: this.companyId, deletedAt: { not: null } },
    });
  }

  async widgetsOnTrashedViews(ids: string[]) {
    const rows = await this.prisma.widget.findMany({
      where: { id: { in: ids }, companyId: this.companyId, view: { is: { deletedAt: { not: null } } } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async findIds(ids: Set<string>) {
    if (ids.size === 0) return new Set<string>();

    const { id: userId, companyId } = this.user;

    const widgets = await this.prisma.widget.findMany({
      where: { id: { in: Array.from(ids) }, companyId, userId, ...LIVE_WIDGET },
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
        ...LIVE_WIDGET,
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
      kind: widget.kind,
      name: widget.name,
      firstName: widget.user.firstName,
      lastName: widget.user.lastName,
      avatarUrl: widget.user.avatarUrl,
    }));
  }

  async getWidgetKind(id: string) {
    const { id: userId, companyId } = this.user;
    const widget = await this.prisma.widget.findFirst({
      where: { id, companyId, OR: [{ userId }, { isTemplate: true }], ...LIVE_WIDGET },
      select: { kind: true },
    });

    return widget?.kind ?? null;
  }

  async getWidgetById(id: string) {
    return runInTransaction(
      async () => {
        const { id: userId, companyId } = this.user;

        const row = await this.prisma.widget.findFirst({
          where: {
            id,
            companyId,
            OR: [{ userId }, { isTemplate: true }],
            ...LIVE_WIDGET,
          },
          select: this.dtoSelect,
        });

        return row ? this.toDto(row) : null;
      },
      { readOnly: true, timeout: 30000 },
    );
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
        ...LIVE_WIDGET,
      },
      select: { id: true, layout: true },
    });

    const results = await Promise.all(
      widgets.map(async (widget) => {
        const layout: WidgetLayout = {
          xs: args.layouts.xs.find((l) => l.i === widget.id),
          sm: args.layouts.sm.find((l) => l.i === widget.id),
          md: args.layouts.md.find((l) => l.i === widget.id),
          lg: args.layouts.lg.find((l) => l.i === widget.id),
        };
        if (deepEqual(widget.layout, recordJson(layout))) return null;

        const saved = await this.prisma.widget.update({
          where: { id: widget.id, companyId, userId, deletedAt: null },
          data: { layout, version: { increment: 1 } },
          select: { id: true, version: true },
        });
        return { ...saved, layout };
      }),
    );
    return results.filter((result) => result !== null);
  }
}
