import { Resource } from "@/generated/prisma";
import { notFound } from "next/navigation";

import { RoutineDetailView } from "../components/routine-detail-view";

import { getGetRoutineInteractor, getGetRoutineRunsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = { params: Promise<{ id: string }> };

export default async function RoutineDetailPage({ params }: Props) {
  await requireAccess({ resource: Resource.api });

  const { id } = await params;

  const routine = await unwrapValidated(getGetRoutineInteractor().invoke({ id })).catch(() => null);
  if (!routine) notFound();

  const runs = await unwrapValidated(getGetRoutineRunsInteractor().invoke({ routineId: id, limit: 25 }));

  return (
    <PageContainer>
      <RoutineDetailView initialRuns={runs} routine={routine} />
    </PageContainer>
  );
}
