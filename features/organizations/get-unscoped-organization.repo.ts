import type { OrganizationDto } from "./organization.schema";

export abstract class GetUnscopedOrganizationRepo {
  abstract getOrThrowUnscoped(id: string): Promise<OrganizationDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<OrganizationDto[]>;
}
