import { runWithoutTenant } from "./tenant-context";

export function BypassTenantGuard(
  _: unknown,
  __: string | symbol,
  descriptor: TypedPropertyDescriptor<(...args: any[]) => any>,
) {
  type Original = NonNullable<typeof descriptor.value>;
  const original = descriptor.value as Original;

  descriptor.value = function (this: ThisParameterType<Original>, ...args: Parameters<Original>): ReturnType<Original> {
    return runWithoutTenant(() => original.apply(this, args));
  } as Original;

  return descriptor;
}
