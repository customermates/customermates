import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getExportRecordsInteractor, getExportRecordWorkbookInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { SPREADSHEET_CONTENT_TYPE } from "@/features/data-transfer/export/record-workbook";

export const runtime = "nodejs";
export const maxDuration = 300;

function wantsWorkbook(data: unknown): boolean {
  return typeof data === "object" && data !== null && "format" in data && data.format === "xlsx";
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    if (wantsWorkbook(data)) {
      const result = await getExportRecordWorkbookInteractor().invoke(data);
      if (!result.ok) return interactorFailureResponse(result.error);
      return new NextResponse(new Uint8Array(result.data.workbook), {
        headers: {
          "content-type": SPREADSHEET_CONTENT_TYPE,
          "content-disposition": `attachment; filename="${result.data.fileName}"`,
          "cache-control": "no-store",
          "x-export-row-count": String(result.data.rowCount),
        },
      });
    }
    const result = await getExportRecordsInteractor().invoke(data);
    if (!result.ok) return interactorFailureResponse(result.error);
    return new NextResponse(JSON.stringify(result.data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="records-${result.data.typeId}.json"`,
        "cache-control": "no-store",
        "x-export-row-count": String(result.data.records.length),
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
