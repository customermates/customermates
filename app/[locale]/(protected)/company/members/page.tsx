import { Resource } from "@/generated/prisma";

import { MembersPageView } from "../components/user/members-page-view";

import { getGetRolesInteractor, getGetUsersInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyUsersPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.users });

  const userParams = await readSurfaceParams(SURFACE.users, searchParams);

  const [users, roles] = await Promise.all([
    unwrapValidated(getGetUsersInteractor().invoke(userParams)),
    unwrapValidated(getGetRolesInteractor().invoke({ p13nId: SURFACE.roles })),
  ]);

  return (
    <PageContainer padded={false}>
      <MembersPageView initialRoles={roles} initialUsers={users} />
    </PageContainer>
  );
}
