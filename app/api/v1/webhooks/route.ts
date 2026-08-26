import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getUpsertWebhookInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getUpsertWebhookInteractor().invoke(data);

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    const { secret, ...webhook } = result.data;

    return NextResponse.json({ ...webhook, hasSecret: secret != null && secret !== "" }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
