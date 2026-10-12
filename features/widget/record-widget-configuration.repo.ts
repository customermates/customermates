import type { Prisma } from "@/generated/prisma";

export type RecordWidgetConfigurationRow = {
  id: string;
  name: string;
  definition: Prisma.JsonValue;
  deletedAt: Date | null;
  view: { deletedAt: Date | null } | null;
};

export abstract class RecordWidgetConfigurationRepo {
  abstract getActivityQueriesCompanyWide(companyId: string, afterId?: string): Promise<RecordWidgetConfigurationRow[]>;
  abstract getMeasuresCompanyWide(companyId: string, afterId?: string): Promise<RecordWidgetConfigurationRow[]>;
  abstract rewriteMeasureCompanyWide(companyId: string, id: string, measure: Prisma.InputJsonValue): Promise<void>;
}
