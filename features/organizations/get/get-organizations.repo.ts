import { type OrganizationDto } from "../organization.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetOrganizationsRepo extends BaseGetRepo<OrganizationDto> {}
