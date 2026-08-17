import { Resource } from "@/generated/prisma";

import { ServicesPageView } from "./components/services-page-view";

import { getGetServicesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ServicesPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.services });

  const params = await searchParams;
  const serviceParams = decodeGetParams(params);

  const services = await unwrapValidated(
    getGetServicesInteractor().invoke({ ...serviceParams, p13nId: "services-card-store" }),
  );

  return (
    <PageContainer padded={false}>
      <ServicesPageView services={services} />
    </PageContainer>
  );
}
