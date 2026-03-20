import { Resource } from "@/generated/prisma";

import { OrganizationsCard } from "./components/organizations-card";

import { GetOrganizationsInteractor } from "@/features/organizations/get/get-organizations.interactor";
import { di } from "@/core/dependency-injection/container";
import { decodeGetParams } from "@/core/utils/get-params";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrganizationsPage({ searchParams }: Props) {
  await di.get(RouteGuardService).ensureAccessOrRedirect({ resource: Resource.organizations });

  const params = await searchParams;
  const organizationParams = decodeGetParams(params);

  const organizations = await di
    .get(GetOrganizationsInteractor)
    .invoke({ ...organizationParams, p13nId: "organizations-card-store" });

  return (
    <XPageContainer>
      <OrganizationsCard organizations={organizations.ok ? organizations.data : { items: [] }} />
    </XPageContainer>
  );
}
