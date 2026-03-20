import { NextResponse } from "next/server";

import { GetServicesConfigurationInteractor } from "@/features/services/get/get-services-configuration.interactor";
import { di } from "@/core/dependency-injection/container";
import { handleError } from "@/core/api/interactor-handler";

export async function GET() {
  try {
    const result = await di.get(GetServicesConfigurationInteractor).invoke();

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
