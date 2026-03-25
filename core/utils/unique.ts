export function unique<T>(...items: readonly (readonly T[] | null | undefined)[]): T[] {
  return [...new Set(items.flatMap((it) => it ?? []))];
}
