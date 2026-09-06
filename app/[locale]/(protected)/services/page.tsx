import { Resource } from "@/generated/prisma";

import { ServicesPageView } from "./components/services-page-view";

import { getGetServicesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ServicesPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.services });

  const serviceParams = await readSurfaceParams(SURFACE.services, searchParams);

  const services = await unwrapValidated(getGetServicesInteractor().invoke(serviceParams));

  return (
    <PageContainer padded={false}>
      <ServicesPageView services={services} />
    </PageContainer>
  );
}
