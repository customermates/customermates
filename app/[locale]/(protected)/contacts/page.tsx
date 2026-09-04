import { Resource } from "@/generated/prisma";

import { ContactsPageView } from "./components/contacts-page-view";

import { getGetContactsInteractor } from "@/core/di";
import { requireAccess } from "@/features/auth/next/require";
import { readSurfaceParams } from "@/core/data-view/next/read-surface-params";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { PageContainer } from "@/components/shared/page-container";
import { unwrapValidated } from "@/core/validation/validation.utils";

export const maxDuration = 60;

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContactsPage({ searchParams }: Props) {
  await requireAccess({ resource: Resource.contacts });

  const contactParams = await readSurfaceParams(SURFACE.contacts, searchParams);

  const contacts = await unwrapValidated(getGetContactsInteractor().invoke(contactParams));

  return (
    <PageContainer padded={false}>
      <ContactsPageView contacts={contacts} />
    </PageContainer>
  );
}
