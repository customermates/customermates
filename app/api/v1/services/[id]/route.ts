import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { DeleteServiceInteractor } from "@/features/services/delete/delete-service.interactor";
import { GetServiceByIdInteractor } from "@/features/services/get/get-service-by-id.interactor";
import { UpdateServiceInteractor } from "@/features/services/upsert/update-service.interactor";
import { di } from "@/core/dependency-injection/container";
import { handleError } from "@/core/api/interactor-handler";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await di.get(DeleteServiceInteractor).invoke({ id });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await di.get(GetServiceByIdInteractor).invoke({ id });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const data = await request.json();
    const result = await di.get(UpdateServiceInteractor).invoke({ ...data, id });

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
