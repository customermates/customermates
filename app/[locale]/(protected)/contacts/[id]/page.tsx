import { Resource } from "@/generated/prisma";

import { ContactDetailPageView } from "./components/contact-detail-page-view";

import { requireAccess } from "@/features/auth/next/require";
type Props = {
  params: Promise<{ id: string }>;
};

export default async function ContactDetailPage({ params }: Props) {
  await requireAccess({ resource: Resource.contacts });

  const { id } = await params;
  return <ContactDetailPageView id={id} />;
}
