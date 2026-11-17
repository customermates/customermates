import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getHeartbeatAgentRunnerInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

import { admitRunner } from "../admit-runner";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const admission = await admitRunner(request.headers);
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getHeartbeatAgentRunnerInteractor().invoke({ ...data, admission });
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json(result.data);
  } catch (error) {
    return handleError(error);
  }
}
