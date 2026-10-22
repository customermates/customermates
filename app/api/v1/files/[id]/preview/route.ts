import { NextResponse } from "next/server";

import { getPreviewRecordFileInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: fileId } = await params;
    const result = await getPreviewRecordFileInteractor().invoke({ fileId });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
