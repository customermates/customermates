import { Resource } from "@/generated/prisma";

import { TaskDetailPageView } from "./components/task-detail-page-view";

import { getRouteGuardService } from "@/core/app-di";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TaskDetailPage({ params }: Props) {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.tasks });

  const { id } = await params;
  return <TaskDetailPageView id={id} />;
}
