import type { ContactDto } from "./contact.schema";

export abstract class GetUnscopedContactRepo {
  abstract getOrThrowUnscoped(id: string): Promise<ContactDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<ContactDto[]>;
}
