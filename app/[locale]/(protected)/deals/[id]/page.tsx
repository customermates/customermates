import { Resource } from "@/generated/prisma";

import { DealDetailPageView } from "./components/deal-detail-page-view";

import { requireAccess } from "@/features/auth/next/require";
type Props = {
  params: Promise<{ id: string }>;
};

export default async function DealDetailPage({ params }: Props) {
  await requireAccess({ resource: Resource.deals });

  const { id } = await params;
  return <DealDetailPageView id={id} />;
}
