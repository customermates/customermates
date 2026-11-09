import { RoutinesPageView } from "./components/routines-page-view";

import { redirect } from "next/navigation";
import { appRedirectHref } from "@/features/auth/next/app-redirect";

import { Resource } from "@/generated/prisma";

import { getGetPlanUsageInteractor, getGetRoutinesInteractor } from "@/core/di";
import { FREE_PLAN_ID } from "@/core/commercial/plan-catalog";
import { FreePlanFeatureOverlay } from "@/app/components/upsell/free-plan-feature-overlay";
import { RoutineAllowanceNotice } from "@/app/components/upsell/routine-allowance-notice";
import { env } from "@/env";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapPage } from "@/core/validation/next/unwrap-page";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RoutinesPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.routines });
  if (env.APP_MODE === "self-hosted") redirect(await appRedirectHref("/dashboard"));

  const routineParams = await readSurfaceParams(SURFACE.routines, searchParams);

  const [routines, usage] = await Promise.all([
    unwrapPage(getGetRoutinesInteractor().invoke(routineParams)),
    unwrapPage(getGetPlanUsageInteractor().invoke()),
  ]);
  const view = <RoutinesPageView initialRoutines={routines} />;

  return (
    <PageContainer padded={false}>
      {usage.plan === FREE_PLAN_ID ? (
        <FreePlanFeatureOverlay feature="routines">{view}</FreePlanFeatureOverlay>
      ) : (
        <>
          <RoutineAllowanceNotice plan={usage.plan} />

          {view}
        </>
      )}
    </PageContainer>
  );
}
