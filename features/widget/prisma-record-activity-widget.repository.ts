import { Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { recordJson } from "@/features/records/record-storage";
import type { WidgetLayout } from "./widget-display.schema";
import { listWidgetPlacements } from "./widget-placement";
import { RecordActivityWidgetDtoSchema } from "./record-activity-widget.schema";
import type { RecordActivityWidgetRepo, RecordActivityWidgetInput } from "./record-activity-widget.schema";
import { LIVE_WIDGET } from "./live-widget";

const StoredSchema = RecordActivityWidgetDtoSchema.omit({ schemaRevision: true, data: true, status: true }).strip();

export class PrismaRecordActivityWidgetRepo extends TenantRepository implements RecordActivityWidgetRepo {
  async findOwned(id: string) {
    const row = await this.prisma.widget.findFirst({
      where: {
        id,
        companyId: this.companyId,
        userId: this.userId,
        ...LIVE_WIDGET,
        kind: "activityTimeline",
        activityQuery: { not: Prisma.AnyNull },
      },
    });
    return row ? StoredSchema.parse({ ...row, viewId: row.userId === this.userId ? row.viewId : null }) : null;
  }

  async findReadable(id: string) {
    const row = await this.prisma.widget.findFirst({
      where: {
        id,
        companyId: this.companyId,
        kind: "activityTimeline",
        ...LIVE_WIDGET,
        OR: [{ userId: this.userId }, { isTemplate: true }],
        activityQuery: { not: Prisma.AnyNull },
      },
    });
    return row ? StoredSchema.parse({ ...row, viewId: row.userId === this.userId ? row.viewId : null }) : null;
  }
  async listOwned() {
    const rows = await this.prisma.widget.findMany({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        kind: "activityTimeline",
        ...LIVE_WIDGET,
        activityQuery: { not: Prisma.AnyNull },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => StoredSchema.parse(row));
  }
  async listPlacements(viewId: string | null) {
    return listWidgetPlacements(this.prisma, this.companyId, this.userId, viewId);
  }
  async save(input: RecordActivityWidgetInput, id: string, viewId: string | null, layout?: WidgetLayout) {
    const data = {
      name: input.name,
      kind: "activityTimeline" as const,
      activityQuery: recordJson(input.activityQuery),
      displayOptions: recordJson(input.displayOptions),
      isTemplate: input.isTemplate,
      viewId,
      ...(layout ? { layout: recordJson(layout) } : {}),
    };
    const row = input.id
      ? await this.prisma.widget.update({
          where: { id, companyId: this.companyId, userId: this.userId, version: input.expectedVersion, deletedAt: null },
          data: { ...data, version: { increment: 1 } },
        })
      : await this.prisma.widget.create({ data: { ...data, id, companyId: this.companyId, userId: this.userId } });
    return StoredSchema.parse(row);
  }
}
