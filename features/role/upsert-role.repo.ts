import type { RolePermissionsDto as RoleDto } from "./role.schema";
import type { UpsertRoleData } from "./role-management.schema";

export abstract class UpsertRoleRepo {
  abstract isSystemRoleOrThrow(id: string): Promise<boolean>;
  abstract upsertRoleOrThrow(data: UpsertRoleData): Promise<RoleDto>;
  abstract getRoleByIdOrThrow(id: string): Promise<RoleDto>;
  abstract findRoleById(id: string): Promise<RoleDto | null>;
}
