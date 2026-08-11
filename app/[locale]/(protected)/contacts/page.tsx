import { Resource } from "@/generated/prisma";

import { ContactsPageView } from "./components/contacts-page-view";

import { getGetContactsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { decodeGetParams } from "@/core/utils/get-params";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContactsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.contacts });

  const params = await searchParams;
  const contactParams = decodeGetParams(params);

  const contacts = await unwrapValidated(
    getGetContactsInteractor().invoke({ ...contactParams, p13nId: "contacts-card-store" }),
  );

  return (
    <PageContainer padded={false}>
      <ContactsPageView contacts={contacts} />
    </PageContainer>
  );
}
