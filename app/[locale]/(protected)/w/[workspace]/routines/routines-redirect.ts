type SearchParams = Record<string, string | string[] | undefined>;

export function routinesRedirectPath(params: SearchParams): string {
  const search = new URLSearchParams({ kind: "routine" });
  for (const [key, value] of Object.entries(params)) {
    if (key === "kind") continue;
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) search.append(key, item);
  }
  return `/automations?${search.toString()}`;
}
