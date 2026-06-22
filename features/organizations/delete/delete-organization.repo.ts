import { type OrganizationDto } from "../organization.schema";

export abstract class DeleteOrganizationRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<OrganizationDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<OrganizationDto[]>;
  abstract deleteOrganizationOrThrow(id: string): Promise<OrganizationDto>;
}
