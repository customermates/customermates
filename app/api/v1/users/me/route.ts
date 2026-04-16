import { NextResponse } from "next/server";

import { getGetUserDetailsInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";

export async function GET() {
  try {
    const result = await getGetUserDetailsInteractor().invoke();

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
