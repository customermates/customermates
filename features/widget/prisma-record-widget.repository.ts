import type { RecordWidgetRepo, SavedRecordWidgetInput, StoredRecordWidget } from "./record-widget.schema";
import { RecordWidgetDtoSchema } from "./record-widget.schema";
import { Prisma } from "@/generated/prisma";
import { TenantRepository } from "@/core/base/tenant-repository";
import type { OwnedWidgetWriteRepo } from "./owned-widget-write.repo";
import { recordJson } from "@/features/records/record-storage";
import type { WidgetLayout } from "./widget-display.schema";
import { listWidgetPlacements } from "./widget-placement";
import { LIVE_WIDGET } from "./live-widget";

const StoredSchema = RecordWidgetDtoSchema.omit({
  data: true,
  status: true,
  groupOptions: true,
  decimalPlaces: true,
}).strip();

export class PrismaRecordWidgetRepo extends TenantRepository implements RecordWidgetRepo {
  constructor(private readonly widgets: OwnedWidgetWriteRepo) {
    super();
  }

  async findOwned(id: string): Promise<StoredRecordWidget | null> {
    const row = await this.prisma.widget.findFirst({
      where: { id, companyId: this.companyId, userId: this.userId, measure: { not: Prisma.AnyNull }, ...LIVE_WIDGET },
    });
    return row ? StoredSchema.parse({ ...row, viewId: row.userId === this.userId ? row.viewId : null }) : null;
  }
  async findReadable(id: string): Promise<StoredRecordWidget | null> {
    const row = await this.prisma.widget.findFirst({
      where: {
        id,
        companyId: this.companyId,
        OR: [{ userId: this.userId }, { isTemplate: true }],
        ...LIVE_WIDGET,
        measure: { not: Prisma.AnyNull },
      },
    });
    return row ? StoredSchema.parse({ ...row, viewId: row.userId === this.userId ? row.viewId : null }) : null;
  }
  async listOwned(): Promise<StoredRecordWidget[]> {
    const rows = await this.prisma.widget.findMany({
      where: { companyId: this.companyId, userId: this.userId, measure: { not: Prisma.AnyNull }, ...LIVE_WIDGET },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => StoredSchema.parse(row));
  }
  async listPlacements(viewId: string | null) {
    return listWidgetPlacements(this.prisma, this.companyId, this.userId, viewId);
  }
  async save(
    input: SavedRecordWidgetInput,
    id: string,
    viewId: string | null,
    layout?: WidgetLayout,
  ): Promise<StoredRecordWidget> {
    const data = {
      name: input.name,
      kind: "chart" as const,
      measure: recordJson(input.measure),
      displayOptions: recordJson(input.displayOptions),
      isTemplate: input.isTemplate,
      viewId,
      ...(layout ? { layout: recordJson(layout) } : {}),
    };
    const row = await this.widgets.saveOwnedWidget({
      companyId: this.companyId,
      userId: this.userId,
      id,
      update: input.id ? { expectedVersion: input.expectedVersion } : null,
      data,
    });
    return StoredSchema.parse(row);
  }
}
