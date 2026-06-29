import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSetPreAuthorizedToolsInteractor, getUserService } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { GATED_TOOL_NAMES } from "@/features/agent-chat/agent-tools";
import { getPreAuthorizedToolNames } from "@/features/agent-chat/pre-authorized-tools";

export async function GET() {
  try {
    const user = await getUserService().getActiveUserOrThrow();

    return NextResponse.json(
      { gatedToolNames: GATED_TOOL_NAMES, preAuthorizedToolNames: getPreAuthorizedToolNames(user) },
      { status: 200 },
    );
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    const result = await getSetPreAuthorizedToolsInteractor().invoke(data);

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
