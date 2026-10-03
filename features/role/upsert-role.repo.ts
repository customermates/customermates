import type { RoleDto } from "./role.schema";
import type { UpsertRoleData } from "./upsert-role.interactor";

export abstract class UpsertRoleRepo {
  abstract isSystemRoleOrThrow(id: string): Promise<boolean>;
  abstract upsertRoleOrThrow(data: UpsertRoleData): Promise<RoleDto>;
  abstract getRoleByIdOrThrow(id: string): Promise<RoleDto>;
}
