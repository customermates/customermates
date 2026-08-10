export type RoleNameSource = {
  isSystemRole: boolean;
  name: string;
};

export function roleDisplayName(role: RoleNameSource, translatedSystemName: string): string {
  return role.isSystemRole ? translatedSystemName : role.name;
}
