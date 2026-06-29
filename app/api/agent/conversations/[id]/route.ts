import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getDeleteAgentConversationInteractor,
  getGetAgentConversationInteractor,
  getRenameAgentConversationInteractor,
} from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getGetAgentConversationInteractor().invoke({ id });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });
    if (!result.data.conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json();
    const result = await getRenameAgentConversationInteractor().invoke({ id, title: data?.title });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getDeleteAgentConversationInteractor().invoke({ id });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
