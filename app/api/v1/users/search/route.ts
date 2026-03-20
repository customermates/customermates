import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { GetUsersApiInteractor } from "@/features/user/get/get-users-api.interactor";
import { di } from "@/core/dependency-injection/container";
import { handleError } from "@/core/api/interactor-handler";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const result = await di.get(GetUsersApiInteractor).invoke(data);

    if (!result.ok) return NextResponse.json(z.prettifyError(result.error), { status: 400 });

    return NextResponse.json(
      {
        searchTerm: result.data.searchTerm,
        sortDescriptor: result.data.sortDescriptor,
        pagination: result.data.pagination,
        items: result.data.items,
      },
      { status: 200 },
    );
  } catch (error) {
    return handleError(error);
  }
}
