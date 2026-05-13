import { Resource } from "@/generated/prisma";

import { OrganizationDetailPageView } from "./components/organization-detail-page-view";

import { getRouteGuardService } from "@/core/app-di";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OrganizationDetailPage({ params }: Props) {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.organizations });

  const { id } = await params;
  return <OrganizationDetailPageView id={id} />;
}
