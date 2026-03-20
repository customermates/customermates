import { NextResponse } from "next/server";

import { GetTasksConfigurationInteractor } from "@/features/tasks/get/get-tasks-configuration.interactor";
import { di } from "@/core/dependency-injection/container";
import { handleError } from "@/core/api/interactor-handler";

export async function GET() {
  try {
    const result = await di.get(GetTasksConfigurationInteractor).invoke();

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
