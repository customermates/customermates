import { Resource } from "@/generated/prisma";

import { OrganizationsPageView } from "./components/organizations-page-view";

import { getGetOrganizationsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrganizationsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.organizations });

  const organizationParams = await readSurfaceParams(SURFACE.organizations, searchParams);

  const organizations = await unwrapValidated(getGetOrganizationsInteractor().invoke(organizationParams));

  return (
    <PageContainer padded={false}>
      <OrganizationsPageView organizations={organizations} />
    </PageContainer>
  );
}
