import { Resource } from "@/generated/prisma";

import { RoutinesPageView } from "./components/routines-page-view";

import { getGetRoutinesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RoutinesPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.api });

  const params = await searchParams;
  const routineParams = decodeGetParams(params);

  const routines = await unwrapValidated(
    getGetRoutinesInteractor().invoke({ ...routineParams, p13nId: "routines-card-store" }),
  );

  return (
    <PageContainer padded={false}>
      <RoutinesPageView initialRoutines={routines} />
    </PageContainer>
  );
}
