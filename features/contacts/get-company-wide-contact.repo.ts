import type { ContactDto } from "./contact.schema";

export abstract class GetCompanyWideContactRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<ContactDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<ContactDto[]>;
}
