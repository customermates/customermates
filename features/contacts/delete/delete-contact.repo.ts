import { type ContactDto } from "../contact.schema";

export abstract class DeleteContactRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<ContactDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<ContactDto[]>;
  abstract deleteContactOrThrow(id: string): Promise<ContactDto>;
}
