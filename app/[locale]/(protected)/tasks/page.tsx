import { Resource } from "@/generated/prisma";

import { TasksCard } from "./components/tasks-card";

import { getGetTasksInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TasksPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.tasks });

  const params = await searchParams;
  const taskParams = decodeGetParams(params);

  const tasks = await unwrapValidated(getGetTasksInteractor().invoke({ ...taskParams, p13nId: "tasks-card-store" }));

  return (
    <PageContainer padded={false}>
      <TasksCard tasks={tasks} />
    </PageContainer>
  );
}
