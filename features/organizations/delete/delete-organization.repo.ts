import { type OrganizationDto } from "../organization.schema";

export abstract class DeleteOrganizationRepo {
  abstract getOrThrowUnscoped(id: string): Promise<OrganizationDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<OrganizationDto[]>;
  abstract deleteOrganizationOrThrow(id: string): Promise<OrganizationDto>;
}
