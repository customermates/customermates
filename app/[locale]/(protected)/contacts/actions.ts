"use server";

import type { GetContactByIdData } from "@/features/contacts/get/get-contact-by-id.interactor";
import type { CreateContactData } from "@/features/contacts/upsert/create-contact.interactor";
import type { IdentifierInput } from "@/features/contacts/contact.schema";
import type { CheckChannelConflictData } from "@/features/contacts/upsert/check-channel-conflict.interactor";
import type { UpdateContactData } from "@/features/contacts/upsert/update-contact.interactor";
import type { SearchChannelCandidatesData } from "@/ee/messaging/inbox/search-channel-candidates.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteContactData } from "@/features/contacts/delete/delete-contact.interactor";

import {
  getGetContactsInteractor,
  getGetContactByIdInteractor,
  getCreateContactInteractor,
  getCheckChannelConflictInteractor,
  getUpdateContactInteractor,
  getSearchChannelCandidatesInteractor,
  getDeleteContactInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function getContactsAction(params?: GetQueryParams) {
  return unwrapValidated(getGetContactsInteractor().invoke(params));
}

export async function createContactAction(data: CreateContactData) {
  return serializeResult(getCreateContactInteractor().invoke(data));
}

export async function updateContactAction(data: UpdateContactData) {
  return serializeResult(getUpdateContactInteractor().invoke(data));
}

export async function checkChannelConflictAction(data: CheckChannelConflictData) {
  return serializeResult(getCheckChannelConflictInteractor().invoke(data));
}

export async function searchChannelCandidatesAction(data: SearchChannelCandidatesData) {
  const result = await getSearchChannelCandidatesInteractor().invoke(data);
  return result.ok ? result.data : [];
}

export async function deleteContactAction(data: DeleteContactData) {
  return serializeResult(getDeleteContactInteractor().invoke(data));
}

export async function getContactByIdAction(data: GetContactByIdData) {
  const result = await unwrapValidated(getGetContactByIdInteractor().invoke(data));
  return { entity: result.contact, customColumns: result.customColumns };
}

export async function createContactByNameAction(
  name: string,
  userId: string | null | undefined,
  identifier?: IdentifierInput,
) {
  const parts = name.split(/\s+/);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");

  const result = await createContactAction({
    firstName,
    lastName,
    notes: null,
    organizationIds: [],
    userIds: userId ? [userId] : [],
    dealIds: [],
    taskIds: [],
    customFieldValues: [],
    identifiers: identifier ? [identifier] : [],
  });

  return result;
}
