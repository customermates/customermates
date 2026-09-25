import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getDiscardDraftInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getDiscardDraftInteractor().invoke({
      messageId: id,
      draftRevision: request.nextUrl.searchParams.get("draftRevision") ?? "",
    });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
