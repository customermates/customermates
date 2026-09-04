import { Resource } from "@/generated/prisma";

import { RolesPageView } from "../components/role/roles-page-view";

import { getGetRolesInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyRolesPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.users });

  const roleParams = await readSurfaceParams(SURFACE.roles, searchParams);
  const roles = await unwrapValidated(getGetRolesInteractor().invoke(roleParams));

  return (
    <PageContainer padded={false}>
      <RolesPageView initialRoles={roles} />
    </PageContainer>
  );
}
