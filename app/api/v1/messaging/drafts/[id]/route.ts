import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getDiscardDraftInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getDiscardDraftInteractor().invoke({ messageId: id });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
