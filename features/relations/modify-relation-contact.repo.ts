import type { ContactDto } from "@/features/contacts/contact.schema";
import type { ReadableIds } from "./modify-entity-relation.interactor";

export abstract class ModifyRelationContactRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<ContactDto>;
  abstract findIds(ids: Set<string>): Promise<ReadableIds>;
}
