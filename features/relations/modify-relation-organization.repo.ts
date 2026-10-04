import type { OrganizationDto } from "@/features/organizations/organization.schema";
import type { ReadableIds } from "./modify-entity-relation.interactor";

export abstract class ModifyRelationOrganizationRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<OrganizationDto>;
  abstract findIds(ids: Set<string>): Promise<ReadableIds>;
}
