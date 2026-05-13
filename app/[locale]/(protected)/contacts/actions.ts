"use server";

import type { GetContactByIdData } from "@/features/contacts/get/get-contact-by-id.interactor";
import type { CreateContactData } from "@/features/contacts/upsert/create-contact.interactor";
import type { UpdateContactData } from "@/features/contacts/upsert/update-contact.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteContactData } from "@/features/contacts/delete/delete-contact.interactor";

import {
  getGetContactsInteractor,
  getGetContactByIdInteractor,
  getCreateContactInteractor,
  getUpdateContactInteractor,
  getDeleteContactInteractor,
} from "@/core/app-di";
import { serializeResult } from "@/core/utils/action-result";

export async function getContactsAction(params?: GetQueryParams) {
  const result = await getGetContactsInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function createContactAction(data: CreateContactData) {
  return serializeResult(getCreateContactInteractor().invoke(data));
}

export async function updateContactAction(data: UpdateContactData) {
  return serializeResult(getUpdateContactInteractor().invoke(data));
}

export async function deleteContactAction(data: DeleteContactData) {
  return getDeleteContactInteractor().invoke(data);
}

export async function getContactByIdAction(data: GetContactByIdData) {
  const result = await getGetContactByIdInteractor().invoke(data);
  return result.ok
    ? { entity: result.data.contact, customColumns: result.data.customColumns }
    : { entity: null, customColumns: [] };
}

export async function createContactByNameAction(name: string, userId: string | null | undefined) {
  const parts = name.split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");

  const result = await createContactAction({
    firstName,
    lastName,
    emails: [],
    notes: null,
    organizationIds: [],
    userIds: userId ? [userId] : [],
    dealIds: [],
    taskIds: [],
    customFieldValues: [],
  });

  return result.ok ? result.data : null;
}
