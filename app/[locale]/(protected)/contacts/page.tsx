import { Resource } from "@/generated/prisma";

import { ContactsCard } from "./components/contacts-card";

import { getGetContactsInteractor } from "@/core/app-di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContactsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.contacts });

  const params = await searchParams;
  const contactParams = decodeGetParams(params);

  const contacts = await getGetContactsInteractor().invoke({ ...contactParams, p13nId: "contacts-card-store" });

  return (
    <PageContainer padded={false}>
      <ContactsCard contacts={contacts.ok ? contacts.data : { items: [] }} />
    </PageContainer>
  );
}
