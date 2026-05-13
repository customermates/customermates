import { Resource } from "@/generated/prisma";

import { RolesCard } from "../components/role/roles-card";

import { getGetRolesInteractor, getRouteGuardService } from "@/core/app-di";
import { PageContainer } from "@/components/shared/page-container";

export default async function CompanyRolesPage() {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.users });

  const roles = await getGetRolesInteractor().invoke({ p13nId: "roles-card-store" });

  return (
    <PageContainer padded={false}>
      <RolesCard initialRoles={roles.ok ? roles.data : { items: [] }} />
    </PageContainer>
  );
}
