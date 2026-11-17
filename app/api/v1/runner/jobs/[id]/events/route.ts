import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getAppendAgentJobEventsInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { visitorKey } from "@/core/network/visitor-key";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getAppendAgentJobEventsInteractor().invoke({
      ...data,
      jobId: id,
      authorization: request.headers.get("authorization"),
      visitor: await visitorKey({ headers: request.headers }),
    });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
