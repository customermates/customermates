import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetMyConnectedAccountsInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { ConnectedAccountDtoSchema } from "@/ee/messaging/messaging.schema";

export async function GET() {
  try {
    const result = await getGetMyConnectedAccountsInteractor().invoke();

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(ConnectedAccountDtoSchema.array().parse(result.data), { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
