import type { Prisma } from "@/generated/prisma";

export type RecordWidgetConfigurationRow = {
  id: string;
  name: string;
  definition: Prisma.JsonValue;
  deletedAt: Date | null;
  view: { deletedAt: Date | null } | null;
};

export type RecordWidgetQueryKind = "calendar" | "map";

export abstract class RecordWidgetConfigurationRepo {
  abstract getActivityQueriesCompanyWide(companyId: string, afterId?: string): Promise<RecordWidgetConfigurationRow[]>;
  abstract getMeasuresCompanyWide(companyId: string, afterId?: string): Promise<RecordWidgetConfigurationRow[]>;
  abstract getRecordWidgetQueriesCompanyWide(
    companyId: string,
    afterId?: string,
  ): Promise<Array<RecordWidgetConfigurationRow & { kind: RecordWidgetQueryKind }>>;
  abstract rewriteMeasureCompanyWide(companyId: string, id: string, measure: Prisma.InputJsonValue): Promise<void>;
  abstract rewriteRecordWidgetQueryCompanyWide(
    companyId: string,
    id: string,
    kind: RecordWidgetQueryKind,
    query: Prisma.InputJsonValue,
  ): Promise<void>;
  abstract trashCompanyWide(companyId: string, id: string): Promise<{ name: string; userId: string } | null>;
}
