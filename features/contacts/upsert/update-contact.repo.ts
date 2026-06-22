import { type ContactDto } from "../contact.schema";

import { type UpdateContactData } from "./update-contact.interactor";

export abstract class UpdateContactRepo {
  abstract updateContactOrThrow(args: UpdateContactData): Promise<ContactDto>;
  abstract getOrThrowCompanyWide(id: string): Promise<ContactDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<ContactDto[]>;
}
