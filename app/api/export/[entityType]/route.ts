import type { ExportPageResult } from "@/core/base/base-export-records-page.interactor";
import type { ExportableRecord } from "@/features/data-transfer/export/export-row-mapper";
import type { ExportRecordsPageData } from "@/features/data-transfer/data-transfer.schema";
import type { NextRequest } from "next/server";
import type { Validated } from "@/core/validation/validation.utils";

import { NextResponse } from "next/server";
import { z } from "zod";
import { EntityType } from "@/generated/prisma";

import {
  getExportContactsPageInteractor,
  getExportDealsPageInteractor,
  getExportOrganizationsPageInteractor,
  getExportServicesPageInteractor,
  getExportTasksPageInteractor,
  getRecordExportAuditInteractor,
} from "@/core/di";
import {
  ENTITY_SHEET_NAME,
  mergeRelationSheets,
  relationSheetNamesFor,
  toRelationSheets,
  toWorkbookRow,
} from "@/features/data-transfer/export/export-row-mapper";
import { EXPORT_PAGE_SIZE, EXPORT_ROW_LIMIT, ExportRequestSchema } from "@/features/data-transfer/data-transfer.schema";
import { buildExportColumns, buildSchemaSheetRows } from "@/features/data-transfer/workbook-columns";
import { buildWorkbook } from "@/features/data-transfer/workbook-writer";
import { handleError } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export const runtime = "nodejs";

export const maxDuration = 300;

const HEADER_OFFSET = 2;

const SPREADSHEET_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type PageInvoker = (data: ExportRecordsPageData) => Validated<ExportPageResult<ExportableRecord>>;

function invokerFor(entityType: EntityType): PageInvoker {
  switch (entityType) {
    case EntityType.contact:
      return (data) => getExportContactsPageInteractor().invoke(data);
    case EntityType.organization:
      return (data) => getExportOrganizationsPageInteractor().invoke(data);
    case EntityType.deal:
      return (data) => getExportDealsPageInteractor().invoke(data);
    case EntityType.service:
      return (data) => getExportServicesPageInteractor().invoke(data);
    case EntityType.task:
      return (data) => getExportTasksPageInteractor().invoke(data);
  }
}

function fileName(entityType: EntityType, isoDate: string): string {
  return `${ENTITY_SHEET_NAME[entityType].toLowerCase()}-${isoDate}.xlsx`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ entityType: string }> }) {
  try {
    const { entityType: rawEntityType } = await params;
    const parsedEntityType = z.enum(EntityType).safeParse(rawEntityType);
    if (!parsedEntityType.success) return NextResponse.json("Unknown entity type", { status: 404 });

    const entityType = parsedEntityType.data;
    const body = await request.json().catch(mapRequestJsonError);
    const parsedBody = ExportRequestSchema.safeParse(body);
    if (!parsedBody.success) return NextResponse.json(z.prettifyError(parsedBody.error), { status: 400 });

    const invoke = invokerFor(entityType);
    const exportRequest = parsedBody.data;

    const firstPage = await invoke({ ...exportRequest, entityType, skip: 0, take: EXPORT_PAGE_SIZE });
    if (!firstPage.ok) return NextResponse.json(z.prettifyError(firstPage.error), { status: 400 });

    const columns = buildExportColumns(exportRequest.columns, firstPage.data.customColumns);

    let failure: NextResponse | null = null;

    const toPage = (data: ExportPageResult<ExportableRecord>, skip: number) => ({
      total: data.total,
      rows: data.rows.map((record) => toWorkbookRow(record, columns)),
      relations: mergeRelationSheets(
        data.rows.flatMap((record, index) => toRelationSheets(record, skip + index + HEADER_OFFSET)),
      ),
    });

    const result = await buildWorkbook({
      sheetName: ENTITY_SHEET_NAME[entityType],
      columns,
      schemaRows: buildSchemaSheetRows(columns),
      relationSheetNames: relationSheetNamesFor(entityType),
      pageSize: EXPORT_PAGE_SIZE,
      rowLimit: EXPORT_ROW_LIMIT,
      fetchPage: async (skip) => {
        if (skip === 0) return toPage(firstPage.data, skip);

        const page = await invoke({ ...exportRequest, entityType, skip, take: EXPORT_PAGE_SIZE });

        if (!page.ok) {
          failure = NextResponse.json(z.prettifyError(page.error), { status: 400 });
          return null;
        }

        return toPage(page.data, skip);
      },
    });

    if (failure) return failure;

    const audit = await getRecordExportAuditInteractor().invoke({
      entityType,
      rowCount: result.rowCount,
      truncated: result.truncated,
      scope: exportRequest.selectedIds?.length ? "selection" : "view",
    });

    if (!audit.ok) throw new Error(`Export audit could not be recorded: ${z.prettifyError(audit.error)}`);

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "content-type": SPREADSHEET_CONTENT_TYPE,
        "content-disposition": `attachment; filename="${fileName(entityType, new Date().toISOString().slice(0, 10))}"`,
        "cache-control": "no-store",
        "x-export-row-count": String(result.rowCount),
        "x-export-truncated": String(result.truncated),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
