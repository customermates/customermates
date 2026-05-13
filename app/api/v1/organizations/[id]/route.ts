import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getDeleteOrganizationInteractor,
  getGetOrganizationByIdInteractor,
  getUpdateOrganizationInteractor,
} from "@/core/app-di";
import { handleError } from "@/core/api/interactor-handler";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getDeleteOrganizationInteractor().invoke({ id });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getGetOrganizationByIdInteractor().invoke({ id });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json();
    const result = await getUpdateOrganizationInteractor().invoke({ ...data, id });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
