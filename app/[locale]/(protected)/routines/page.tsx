import { RoutinesPageView } from "./components/routines-page-view";

import { redirect } from "next/navigation";

import { getGetRoutinesInteractor } from "@/core/di";
import { env } from "@/env";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RoutinesPage({ searchParams }: Props) {
  await requireAccess();
  if (env.APP_MODE === "self-hosted") redirect("/dashboard");

  const routineParams = await readSurfaceParams(SURFACE.routines, searchParams);

  const routines = await unwrapValidated(getGetRoutinesInteractor().invoke(routineParams));

  return (
    <PageContainer padded={false}>
      <RoutinesPageView initialRoutines={routines} />
    </PageContainer>
  );
}
