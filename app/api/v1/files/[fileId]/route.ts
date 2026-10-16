import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getGetRecordFileInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const result = await getGetRecordFileInteractor().invoke({ fileId });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
