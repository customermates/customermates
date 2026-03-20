import { NextResponse } from "next/server";

import { GetOrganizationsConfigurationInteractor } from "@/features/organizations/get/get-organizations-configuration.interactor";
import { di } from "@/core/dependency-injection/container";
import { handleError } from "@/core/api/interactor-handler";

export async function GET() {
  try {
    const result = await di.get(GetOrganizationsConfigurationInteractor).invoke();

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
