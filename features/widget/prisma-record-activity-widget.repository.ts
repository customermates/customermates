import { Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import { recordJson } from "@/features/records/record-storage";
import { RecordActivityWidgetDtoSchema } from "./record-activity-widget.schema";
import type { RecordActivityWidgetRepo, RecordActivityWidgetInput } from "./record-activity-widget.schema";

const StoredSchema = RecordActivityWidgetDtoSchema.omit({ schemaRevision: true, data: true, status: true }).strip();

export class PrismaRecordActivityWidgetRepo extends TenantRepository implements RecordActivityWidgetRepo {
  async findOwned(id: string) {
    const row = await this.prisma.widget.findFirst({
      where: {
        id,
        companyId: this.companyId,
        userId: this.userId,
        kind: "activityTimeline",
        activityQuery: { not: Prisma.AnyNull },
      },
    });
    return row ? StoredSchema.parse(row) : null;
  }

  async findReadable(id: string) {
    const row = await this.prisma.widget.findFirst({
      where: {
        id,
        companyId: this.companyId,
        kind: "activityTimeline",
        OR: [{ userId: this.userId }, { isTemplate: true }],
        activityQuery: { not: Prisma.AnyNull },
      },
    });
    return row ? StoredSchema.parse(row) : null;
  }
  async listOwned() {
    const rows = await this.prisma.widget.findMany({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        kind: "activityTimeline",
        activityQuery: { not: Prisma.AnyNull },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => StoredSchema.parse(row));
  }
  async save(input: RecordActivityWidgetInput, id: string) {
    const data = {
      name: input.name,
      kind: "activityTimeline" as const,
      activityQuery: recordJson(input.activityQuery),
      displayOptions: recordJson(input.displayOptions),
      isTemplate: input.isTemplate,
    };
    const row = input.id
      ? await this.prisma.widget.update({
          where: { id, companyId: this.companyId, userId: this.userId, version: input.expectedVersion },
          data: { ...data, version: { increment: 1 } },
        })
      : await this.prisma.widget.create({ data: { ...data, id, companyId: this.companyId, userId: this.userId } });
    return StoredSchema.parse(row);
  }
}
