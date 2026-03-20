import { Resource } from "@/generated/prisma";

import { TasksCardComponent } from "./components/tasks-card";

import { GetTasksInteractor } from "@/features/tasks/get/get-tasks.interactor";
import { di } from "@/core/dependency-injection/container";
import { decodeGetParams } from "@/core/utils/get-params";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TasksPage({ searchParams }: Props) {
  await di.get(RouteGuardService).ensureAccessOrRedirect({ resource: Resource.tasks });

  const params = await searchParams;
  const taskParams = decodeGetParams(params);

  const tasks = await di.get(GetTasksInteractor).invoke({ ...taskParams, p13nId: "tasks-card-store" });

  return (
    <XPageContainer>
      <TasksCardComponent tasks={tasks.ok ? tasks.data : { items: [] }} />
    </XPageContainer>
  );
}
