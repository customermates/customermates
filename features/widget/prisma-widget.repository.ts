import { runInTransaction } from "@/core/decorators/transaction-runner";
import deepEqual from "fast-deep-equal";
import { recordJson } from "@/features/records/record-storage";
import type { DeleteWidgetRepo } from "./delete-widget.repo";
import type { FindWidgetsByIdsRepo } from "./find-widgets-by-ids.repo";
import type { GetCompanyWidgetsRepo } from "./get-company-widgets.interactor";
import type { GetWidgetByIdRepo } from "./get-widget-by-id.interactor";
import type { GetWidgetsRepo } from "./get-widgets.repo";
import { RecordActivityWidgetDtoSchema } from "./record-activity-widget.schema";
import { RecordWidgetDtoSchema } from "./record-widget.schema";
import type { UpdateWidgetLayoutsRepo, WidgetLayoutTarget, WidgetLayoutWrite } from "./update-widget-layouts.repo";
import type { SavedWidgetLayout } from "./update-widget-layouts.interactor";
import type { WidgetPlacementRow } from "./widget-placement";
import { listWidgetPlacements } from "./widget-placement";
import { WidgetLayoutSchema } from "./widget-display.schema";
import type { WidgetDto } from "./widget.schema";
import type { RecordWidgetConfigurationRepo, RecordWidgetConfigurationRow } from "./record-widget-configuration.repo";
import type { OwnedWidgetWrite, OwnedWidgetWriteRepo } from "./owned-widget-write.repo";
import type { ViewWidgetPurgeRepo } from "./view-widget-purge.repo";

import { Prisma, WidgetKind } from "@/generated/prisma";

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
    FindWidgetsByIdsRepo,
    RecordWidgetConfigurationRepo,
    OwnedWidgetWriteRepo,
    ViewWidgetPurgeRepo
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
      const stored = RecordWidgetDtoSchema.omit({ data: true, status: true, groupOptions: true, decimalPlaces: true })
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
  async findLayoutTargets(ids: string[]): Promise<WidgetLayoutTarget[]> {
    if (!ids.length) return [];
    const { id: userId, companyId } = this.user;
    const rows = await this.prisma.widget.findMany({
      where: { companyId, userId, id: { in: ids }, ...LIVE_WIDGET },
      select: { id: true, kind: true, layout: true, version: true, viewId: true },
    });
    return rows.map((row) => {
      const layout = WidgetLayoutSchema.safeParse(row.layout);
      return { ...row, layout: layout.success ? layout.data : null };
    });
  }

  listLayoutPlacements(viewId: string | null): Promise<WidgetPlacementRow[]> {
    const { id: userId, companyId } = this.user;
    return listWidgetPlacements(this.prisma, companyId, userId, viewId);
  }

  async saveWidgetLayouts(writes: WidgetLayoutWrite[]): Promise<SavedWidgetLayout[] | null> {
    const { id: userId, companyId } = this.user;
    const saved: SavedWidgetLayout[] = [];
    for (const write of writes) {
      if (deepEqual(write.current, recordJson(write.layout))) continue;
      const { count } = await this.prisma.widget.updateMany({
        where: { companyId, id: write.id, userId, version: write.expectedVersion, ...LIVE_WIDGET },
        data: { layout: write.layout, version: { increment: 1 } },
      });
      if (count === 0) return null;
      saved.push({ id: write.id, version: write.expectedVersion + 1, layout: write.layout });
    }
    return saved;
  }

  async saveOwnedWidget({ companyId, userId, id, update, data }: OwnedWidgetWrite) {
    return update
      ? this.prisma.widget.update({
          where: { id, companyId, userId, version: update.expectedVersion, deletedAt: null },
          data: { ...data, version: { increment: 1 } },
        })
      : this.prisma.widget.create({ data: { ...data, id, companyId, userId } });
  }

  async purgeOnTrashedViewsCompanyWide(companyId: string, viewIds: string[]): Promise<void> {
    await this.prisma.widget.deleteMany({
      where: { companyId, viewId: { in: viewIds }, view: { is: { deletedAt: { not: null } } } },
    });
  }

  async getActivityQueriesCompanyWide(companyId: string, afterId?: string): Promise<RecordWidgetConfigurationRow[]> {
    const rows = await this.prisma.widget.findMany({
      where: { companyId, activityQuery: { not: Prisma.AnyNull }, ...(afterId ? { id: { gt: afterId } } : {}) },
      select: { id: true, name: true, activityQuery: true, deletedAt: true, view: { select: { deletedAt: true } } },
      orderBy: { id: "asc" },
      take: 200,
    });
    return rows.map(({ activityQuery, ...row }) => ({ ...row, definition: activityQuery }));
  }

  async getMeasuresCompanyWide(companyId: string, afterId?: string): Promise<RecordWidgetConfigurationRow[]> {
    const rows = await this.prisma.widget.findMany({
      where: { companyId, measure: { not: Prisma.AnyNull }, ...(afterId ? { id: { gt: afterId } } : {}) },
      select: { id: true, name: true, measure: true, deletedAt: true, view: { select: { deletedAt: true } } },
      orderBy: { id: "asc" },
      take: 200,
    });
    return rows.map(({ measure, ...row }) => ({ ...row, definition: measure }));
  }

  async rewriteMeasureCompanyWide(companyId: string, id: string, measure: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.widget.updateMany({
      where: { companyId, id },
      data: { measure, version: { increment: 1 } },
    });
  }
}
