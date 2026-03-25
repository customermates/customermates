import { type OrganizationDto } from "../organization.schema";

import { type UpdateOrganizationData } from "./update-organization.interactor";

export abstract class UpdateOrganizationRepo {
  abstract updateOrganizationOrThrow(args: UpdateOrganizationData): Promise<OrganizationDto>;
  abstract getOrThrowUnscoped(id: string): Promise<OrganizationDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<OrganizationDto[]>;
}
