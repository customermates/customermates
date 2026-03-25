import { type ContactDto } from "../contact.schema";

export abstract class DeleteContactRepo {
  abstract getOrThrowUnscoped(id: string): Promise<ContactDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<ContactDto[]>;
  abstract deleteContactOrThrow(id: string): Promise<ContactDto>;
}
