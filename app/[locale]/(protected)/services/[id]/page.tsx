import { Resource } from "@/generated/prisma";

import { ServiceDetailPageView } from "./components/service-detail-page-view";

import { requireAccess } from "@/features/auth/next/require";
type Props = {
  params: Promise<{ id: string }>;
};

export default async function ServiceDetailPage({ params }: Props) {
  await requireAccess({ resource: Resource.services });

  const { id } = await params;
  return <ServiceDetailPageView id={id} />;
}
