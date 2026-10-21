import { RoutinesPageView } from "./components/routines-page-view";

import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { Resource } from "@/generated/prisma";

import { getGetRoutinesInteractor } from "@/core/di";
import { env } from "@/env";
import { buildLocalePath } from "@/i18n/locale-registry";
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
  if (env.APP_MODE === "self-hosted") redirect(buildLocalePath(await getLocale(), "/dashboard"));

  const routineParams = await readSurfaceParams(SURFACE.routines, searchParams);

  const routines = await unwrapPage(getGetRoutinesInteractor().invoke(routineParams));

  return (
    <PageContainer padded={false}>
      <RoutinesPageView initialRoutines={routines} />
    </PageContainer>
  );
}
