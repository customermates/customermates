import { Resource } from "@/generated/prisma";

import { OrganizationsPageView } from "./components/organizations-page-view";

import { getGetOrganizationsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrganizationsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.organizations });

  const params = await searchParams;
  const organizationParams = decodeGetParams(params);

  const organizations = await unwrapValidated(
    getGetOrganizationsInteractor().invoke({
      ...organizationParams,
      p13nId: "organizations-card-store",
    }),
  );

  return (
    <PageContainer padded={false}>
      <OrganizationsPageView organizations={organizations} />
    </PageContainer>
  );
}
