import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { GetServicesApiInteractor } from "@/features/services/get/get-services-api.interactor";
import { di } from "@/core/dependency-injection/container";
import { handleError } from "@/core/api/interactor-handler";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const result = await di.get(GetServicesApiInteractor).invoke(data);

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
