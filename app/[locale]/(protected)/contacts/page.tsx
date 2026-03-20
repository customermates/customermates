import { Resource } from "@/generated/prisma";

import { ContactsCard } from "./components/contacts-card";

import { GetContactsInteractor } from "@/features/contacts/get/get-contacts.interactor";
import { di } from "@/core/dependency-injection/container";
import { decodeGetParams } from "@/core/utils/get-params";
import { RouteGuardService } from "@/features/auth/route-guard.service";
import { XPageContainer } from "@/components/x-layout-primitives/x-page-container";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContactsPage({ searchParams }: Props) {
  await di.get(RouteGuardService).ensureAccessOrRedirect({ resource: Resource.contacts });

  const params = await searchParams;
  const contactParams = decodeGetParams(params);

  const contacts = await di.get(GetContactsInteractor).invoke({ ...contactParams, p13nId: "contacts-card-store" });

  return (
    <XPageContainer>
      <ContactsCard contacts={contacts.ok ? contacts.data : { items: [] }} />
    </XPageContainer>
  );
}
