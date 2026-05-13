import { Resource } from "@/generated/prisma";

import { OrganizationsCard } from "./components/organizations-card";

import { getGetOrganizationsInteractor, getRouteGuardService } from "@/core/app-di";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrganizationsPage({ searchParams }: Props) {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.organizations });

  const params = await searchParams;
  const organizationParams = decodeGetParams(params);

  const organizations = await getGetOrganizationsInteractor().invoke({
    ...organizationParams,
    p13nId: "organizations-card-store",
  });

  return (
    <PageContainer padded={false}>
      <OrganizationsCard organizations={organizations.ok ? organizations.data : { items: [] }} />
    </PageContainer>
  );
}
