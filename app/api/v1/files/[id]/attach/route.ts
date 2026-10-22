import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getAttachRecordFileInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: fileId } = await params;
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getAttachRecordFileInteractor().invoke({ ...data, fileId });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
