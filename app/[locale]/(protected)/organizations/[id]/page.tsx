import { Resource } from "@/generated/prisma";

import { OrganizationDetailPageView } from "./components/organization-detail-page-view";

import { requireAccess } from "@/features/auth/next/require";
type Props = {
  params: Promise<{ id: string }>;
};

export default async function OrganizationDetailPage({ params }: Props) {
  await requireAccess({ resource: Resource.organizations });

  const { id } = await params;
  return <OrganizationDetailPageView id={id} />;
}
