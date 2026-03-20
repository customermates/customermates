import { NextResponse } from "next/server";

import { GetUserDetailsInteractor } from "@/features/user/get/get-user-details.interactor";
import { di } from "@/core/dependency-injection/container";
import { handleError } from "@/core/api/interactor-handler";

export async function GET() {
  try {
    const result = await di.get(GetUserDetailsInteractor).invoke();

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
