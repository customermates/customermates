import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getExportRecordsInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
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
