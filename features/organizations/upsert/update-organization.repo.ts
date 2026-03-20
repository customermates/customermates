import { type OrganizationDto } from "../organization.schema";

import { type UpdateOrganizationData } from "./update-organization.interactor";

export abstract class UpdateOrganizationRepo {
  abstract updateOrganizationOrThrow(args: UpdateOrganizationData): Promise<OrganizationDto>;
  abstract getOrganizationByIdOrThrow(id: string): Promise<OrganizationDto>;
}
