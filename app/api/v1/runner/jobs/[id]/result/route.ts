import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getFinishAgentJobInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

import { admitRunner } from "../../../admit-runner";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const admission = await admitRunner(request.headers);
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getFinishAgentJobInteractor().invoke({ ...data, jobId: id, admission });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
