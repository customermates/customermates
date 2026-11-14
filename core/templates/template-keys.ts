export const MAX_PLAN_KEY_LENGTH = 24;

export function camelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

export function splitFieldRef(ref: string): { list: string; field: string } {
  const [list = "", field = ""] = ref.split(".");
  return { list, field };
}

export function camelFieldRef(ref: string): string {
  const { list, field } = splitFieldRef(ref);
  return `${camelKey(list)}.${camelKey(field)}`;
}

export function refList(ref: string): string {
  return splitFieldRef(ref).list;
}
