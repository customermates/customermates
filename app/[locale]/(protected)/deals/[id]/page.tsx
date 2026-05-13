import { Resource } from "@/generated/prisma";

import { DealDetailPageView } from "./components/deal-detail-page-view";

import { getRouteGuardService } from "@/core/app-di";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function DealDetailPage({ params }: Props) {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.deals });

  const { id } = await params;
  return <DealDetailPageView id={id} />;
}
