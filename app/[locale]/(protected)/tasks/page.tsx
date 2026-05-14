import { Resource } from "@/generated/prisma";

import { TasksCardComponent } from "./components/tasks-card";

import { getGetTasksInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TasksPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.tasks });

  const params = await searchParams;
  const taskParams = decodeGetParams(params);

  const tasks = await getGetTasksInteractor().invoke({ ...taskParams, p13nId: "tasks-card-store" });

  return (
    <PageContainer padded={false}>
      <TasksCardComponent tasks={tasks.ok ? tasks.data : { items: [] }} />
    </PageContainer>
  );
}
