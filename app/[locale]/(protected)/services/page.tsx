import { Resource } from "@/generated/prisma";

import { ServicesCard } from "./components/services-card";

import { GetServicesInteractor } from "@/features/services/get/get-services.interactor";
import { di } from "@/core/dependency-injection/container";
import { decodeGetParams } from "@/core/utils/get-params";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ServicesPage({ searchParams }: Props) {
  await di.get(RouteGuardService).ensureAccessOrRedirect({ resource: Resource.services });

  const params = await searchParams;
  const serviceParams = decodeGetParams(params);

  const services = await di.get(GetServicesInteractor).invoke({ ...serviceParams, p13nId: "services-card-store" });

  return (
    <XPageContainer>
      <ServicesCard services={services.ok ? services.data : { items: [] }} />
    </XPageContainer>
  );
}
