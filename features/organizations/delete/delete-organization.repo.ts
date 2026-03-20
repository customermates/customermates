import { type OrganizationDto } from "../organization.schema";

export abstract class DeleteOrganizationRepo {
  abstract deleteOrganizationOrThrow(id: string): Promise<OrganizationDto>;
}
