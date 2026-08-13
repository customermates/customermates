import { Resource } from "@/generated/prisma";

import { RolesPageView } from "../components/role/roles-page-view";

import { getGetRolesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export default async function CompanyRolesPage() {
  await requireAccess({ resource: Resource.users });

  const roles = await unwrapValidated(getGetRolesInteractor().invoke({ p13nId: "roles-card-store" }));

  return (
    <PageContainer padded={false}>
      <RolesPageView initialRoles={roles} />
    </PageContainer>
  );
}
