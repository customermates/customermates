import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetMyConnectedAccountsApiInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";

export async function GET() {
  try {
    const result = await getGetMyConnectedAccountsApiInteractor().invoke();

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
