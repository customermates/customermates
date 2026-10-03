import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getImportRecordsInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getImportRecordsInteractor().invoke(data);
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
