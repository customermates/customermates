import type { UpdateManyOrganizationsData } from "@/features/organizations/upsert/update-many-organizations.interactor";
import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { Validated } from "@/core/validation/validation.utils";

export abstract class ModifyRelationUpdateOrganizationsPort {
  abstract invoke(data: UpdateManyOrganizationsData): Validated<OrganizationDto[]>;
}
