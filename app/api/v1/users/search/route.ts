import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import { z } from "zod";

import { getGetUsersApiInteractor } from "@/core/app-di";
import { handleError } from "@/core/api/interactor-handler";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const result = await getGetUsersApiInteractor().invoke(data);

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
