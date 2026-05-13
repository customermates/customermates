import { Resource } from "@/generated/prisma";

import { ServiceDetailPageView } from "./components/service-detail-page-view";

import { getRouteGuardService } from "@/core/app-di";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ServiceDetailPage({ params }: Props) {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.services });

  const { id } = await params;
  return <ServiceDetailPageView id={id} />;
}
