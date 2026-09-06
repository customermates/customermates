import { Resource } from "@/generated/prisma";

import { TasksPageView } from "./components/tasks-page-view";

import { getGetTasksInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TasksPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.tasks });

  const taskParams = await readSurfaceParams(SURFACE.tasks, searchParams);

  const tasks = await unwrapValidated(getGetTasksInteractor().invoke(taskParams));

  return (
    <PageContainer padded={false}>
      <TasksPageView tasks={tasks} />
    </PageContainer>
  );
}
