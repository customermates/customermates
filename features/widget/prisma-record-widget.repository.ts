import type { RecordWidgetRepo, RecordWidgetInput, StoredRecordWidget } from "./record-widget.schema";
import { RecordWidgetDtoSchema } from "./record-widget.schema";
import { Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/core/base/base-repository";
import { recordJson } from "@/features/records/record-storage";

const StoredSchema = RecordWidgetDtoSchema.omit({ data: true, status: true, groupOptions: true }).strip();

export class PrismaRecordWidgetRepo extends BaseRepository implements RecordWidgetRepo {
  async findOwned(id: string): Promise<StoredRecordWidget | null> {
    const row = await this.prisma.widget.findFirst({
      where: { id, companyId: this.companyId, userId: this.userId, measure: { not: Prisma.AnyNull } },
    });
    return row ? StoredSchema.parse({ ...row, contractVersion: 2 }) : null;
  }
  async findReadable(id: string): Promise<StoredRecordWidget | null> {
    const row = await this.prisma.widget.findFirst({
      where: {
        id,
        companyId: this.companyId,
        OR: [{ userId: this.userId }, { isTemplate: true }],
        measure: { not: Prisma.AnyNull },
      },
    });
    return row ? StoredSchema.parse({ ...row, contractVersion: 2 }) : null;
  }
  async listOwned(): Promise<StoredRecordWidget[]> {
    const rows = await this.prisma.widget.findMany({
      where: { companyId: this.companyId, userId: this.userId, measure: { not: Prisma.AnyNull } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => StoredSchema.parse({ ...row, contractVersion: 2 }));
  }
  async save(input: RecordWidgetInput, id: string): Promise<StoredRecordWidget> {
    const data = {
      name: input.name,
      kind: "chart" as const,
      measure: recordJson(input.measure),
      displayOptions: recordJson(input.displayOptions),
      isTemplate: input.isTemplate,
    };
    const row = input.id
      ? await this.prisma.widget.update({
          where: { id, companyId: this.companyId, userId: this.userId, version: input.expectedVersion },
          data: { ...data, version: { increment: 1 } },
        })
      : await this.prisma.widget.create({ data: { ...data, id, companyId: this.companyId, userId: this.userId } });
    return StoredSchema.parse({ ...row, contractVersion: 2 });
  }
}
