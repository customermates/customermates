import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getCreateManyContactsInteractor,
  getUpdateManyContactsInteractor,
  getDeleteManyContactsInteractor,
} from "@/core/app-di";
import { handleError } from "@/core/api/interactor-handler";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const result = await getCreateManyContactsInteractor().invoke(data);

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    const result = await getUpdateManyContactsInteractor().invoke(data);

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const data = await request.json();
    const result = await getDeleteManyContactsInteractor().invoke(data);

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
