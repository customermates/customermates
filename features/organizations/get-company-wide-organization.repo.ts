import type { OrganizationDto } from "./organization.schema";

export abstract class GetCompanyWideOrganizationRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<OrganizationDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<OrganizationDto[]>;
}
