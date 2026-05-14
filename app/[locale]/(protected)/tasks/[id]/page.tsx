import { Resource } from "@/generated/prisma";

import { TaskDetailPageView } from "./components/task-detail-page-view";

import { requireAccess } from "@/features/auth/next/require";
type Props = {
  params: Promise<{ id: string }>;
};

export default async function TaskDetailPage({ params }: Props) {
  await requireAccess({ resource: Resource.tasks });

  const { id } = await params;
  return <TaskDetailPageView id={id} />;
}
