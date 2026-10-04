import type { RolePermissionsDto as RoleDto } from "./role.schema";

export abstract class DeleteRoleRepo {
  abstract isSystemRoleOrThrow(id: string): Promise<boolean>;
  abstract hasUsersAssigned(id: string): Promise<boolean>;
  abstract deleteRoleOrThrow(id: string): Promise<RoleDto>;
}
