import type { RoleWithAssignmentsDto as RoleDto } from "./role.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetRolesRepo extends BaseGetRepo<RoleDto> {}
