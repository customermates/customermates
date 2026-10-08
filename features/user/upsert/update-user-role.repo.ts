import type { RoleDto } from "@/features/role/role.schema";

export abstract class UpdateUserRoleRepo {
  abstract isSystemRoleOrThrow(id: string): Promise<boolean>;
  abstract hasAnotherActiveSystemRoleUser(excludeUserId: string): Promise<boolean>;
  abstract findRoleById(id: string): Promise<RoleDto | null>;
}
