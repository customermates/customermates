export function AllowInDemoMode<T extends { new (...args: any[]): object }>(constructor: T) {
  (constructor as any).__allowInDemoMode = true;
  return constructor;
}

export function isAllowedInDemoMode(constructor: { new (...args: any[]): object }): boolean {
  return Boolean((constructor as any).__allowInDemoMode);
}
