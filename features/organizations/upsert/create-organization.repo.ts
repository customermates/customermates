import { type OrganizationDto } from "../organization.schema";

import { type CreateOrganizationData } from "./create-organization.interactor";

export abstract class CreateOrganizationRepo {
  abstract createOrganizationOrThrow(args: CreateOrganizationData): Promise<OrganizationDto>;
}
