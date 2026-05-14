import { Resource } from "@/generated/prisma";

import { UsersCard } from "../components/user/users-card";

import { getGetRolesInteractor, getGetUsersInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompanyUsersPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.users });

  const params = await searchParams;
  const userParams = decodeGetParams(params);

  const [users, roles] = await Promise.all([
    getGetUsersInteractor().invoke({ ...userParams, p13nId: "users-card-store" }),
    getGetRolesInteractor().invoke({ p13nId: "roles-card-store" }),
  ]);

  return (
    <PageContainer padded={false}>
      <UsersCard
        initialRoles={roles.ok ? roles.data : { items: [] }}
        initialUsers={users.ok ? users.data : { items: [] }}
      />
    </PageContainer>
  );
}
