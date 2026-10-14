import type { NextRequest } from "next/server";
import type { Validated } from "@/core/validation/validation.utils";
import type { DashboardWidgets } from "@/features/widget/get-widgets.interactor";

import { NextResponse } from "next/server";

import { getGetWidgetsInteractor } from "@/core/di";
import { handleError, interactorFailureResponse } from "@/core/api/structured-interactor-handler";
import { mapRequestJsonError } from "@/core/api/request-json-error";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json().catch(mapRequestJsonError);
    const result = await (getGetWidgetsInteractor().invoke({ ...data, allViews: true }) as Validated<DashboardWidgets>);
    if (!result.ok) return interactorFailureResponse(result.error);
    return NextResponse.json({ widgets: result.data.items });
  } catch (error) {
    return handleError(error);
  }
}
