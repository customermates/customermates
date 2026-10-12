import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getDeleteConnectedAccountInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getDeleteConnectedAccountInteractor().invoke({ id });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json({ id, disconnected: true });
  } catch (error) {
    return handleError(error);
  }
}
