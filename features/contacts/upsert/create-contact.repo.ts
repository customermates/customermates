import { type ContactDto } from "../contact.schema";

import { type CreateContactData } from "./create-contact.interactor";

export abstract class CreateContactRepo {
  abstract createContactOrThrow(args: CreateContactData): Promise<ContactDto>;
}
