import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

import { getDeleteTaskInteractor, getGetTaskByIdInteractor, getUpdateTaskInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getDeleteTaskInteractor().invoke({ id });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await getGetTaskByIdInteractor().invoke({ id });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json().catch(mapRequestJsonError);
    const result = await getUpdateTaskInteractor().invoke({ ...data, id });

    if (!result.ok) return interactorFailureResponse(result.error);

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
