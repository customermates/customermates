import type { UpdateManyContactsData } from "@/features/contacts/upsert/update-many-contacts.interactor";
import type { ContactDto } from "@/features/contacts/contact.schema";
import type { Validated } from "@/core/validation/validation.utils";

export abstract class ModifyRelationUpdateContactsPort {
  abstract invoke(data: UpdateManyContactsData): Validated<ContactDto[]>;
}
