import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getDeleteAgentSkillInteractor, getUpdateAgentSkillInteractor } from "@/core/di";
import { handleError } from "@/core/api/interactor-handler";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json();
    // id always comes from the path; companyId is never accepted from the body
    // (tenant scoping is enforced in the interactor/repo from the auth context).
    const result = await getUpdateAgentSkillInteractor().invoke({ ...data, id });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });
    if (!result.data) return NextResponse.json({ error: "not_found" }, { status: 404 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getDeleteAgentSkillInteractor().invoke({ id });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
