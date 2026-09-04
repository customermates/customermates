import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSaveDraftInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";
import { SaveNewThreadDraftSchema } from "@/ee/messaging/outbound/save-draft.interactor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(mapRequestJsonError);
    const parsed = SaveNewThreadDraftSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json(z.prettifyError(parsed.error), { status: 400 });

    const result = await getSaveDraftInteractor().invoke(parsed.data);

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
