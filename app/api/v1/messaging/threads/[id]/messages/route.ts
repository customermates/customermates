import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getSendChatMessageInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getSendChatMessageInteractor().invoke({ ...data, threadId: id });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
