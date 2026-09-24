import { NextResponse } from "next/server";

import { getGetMyConnectedAccountsApiInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";

export async function GET() {
  try {
    const result = await getGetMyConnectedAccountsApiInteractor().invoke();

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
