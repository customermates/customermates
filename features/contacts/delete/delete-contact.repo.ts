import { type ContactDto } from "../contact.schema";

export abstract class DeleteContactRepo {
  abstract deleteContactOrThrow(id: string): Promise<ContactDto>;
}
