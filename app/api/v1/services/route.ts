import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { CreateServiceInteractor } from "@/features/services/upsert/create-service.interactor";
import { di } from "@/core/dependency-injection/container";
import { handleError } from "@/core/api/interactor-handler";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const result = await di.get(CreateServiceInteractor).invoke(data);

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
