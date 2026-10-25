import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getGetRecordFileInteractor, getRenameRecordFileInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: fileId } = await params;
    const result = await getGetRecordFileInteractor().invoke({ fileId });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: fileId } = await params;
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getRenameRecordFileInteractor().invoke({ ...data, fileId });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
