import { Resource } from "@/generated/prisma";

import { ServicesCard } from "./components/services-card";

import { getGetServicesInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ServicesPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.services });

  const params = await searchParams;
  const serviceParams = decodeGetParams(params);

  const services = await getGetServicesInteractor().invoke({ ...serviceParams, p13nId: "services-card-store" });

  return (
    <PageContainer padded={false}>
      <ServicesCard services={services.ok ? services.data : { items: [] }} />
    </PageContainer>
  );
}
