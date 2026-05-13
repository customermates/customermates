import { Resource } from "@/generated/prisma";

import { ContactDetailPageView } from "./components/contact-detail-page-view";

import { getRouteGuardService } from "@/core/app-di";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ContactDetailPage({ params }: Props) {
  await getRouteGuardService().ensureAccessOrRedirect({ resource: Resource.contacts });

  const { id } = await params;
  return <ContactDetailPageView id={id} />;
}
