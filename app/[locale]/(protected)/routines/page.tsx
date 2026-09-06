import { RoutinesPageView } from "./components/routines-page-view";

import { redirect } from "next/navigation";

import { getGetRoutinesInteractor } from "@/core/di";
import { env } from "@/env";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RoutinesPage({ searchParams }: Props) {
  await requireAccess();
  if (env.APP_MODE === "self-hosted") redirect("/dashboard");

  const params = await searchParams;
  const routineParams = decodeGetParams(params);

  const routines = await unwrapValidated(
    getGetRoutinesInteractor().invoke({
      ...routineParams,
      p13nId: "routines-card-store",
    }),
  );

  return (
    <PageContainer padded={false}>
      <RoutinesPageView initialRoutines={routines} />
    </PageContainer>
  );
}
