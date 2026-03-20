import { injectable } from "inversify";

/**
 * Marks a class as tenant-agnostic, meaning it does not require tenant context to operate.
 *
 * IMPORTANT: Tenant-agnostic classes can only be lazily injected by tenant-scoped classes.
 * They should not be injected via constructor parameters in tenant-scoped classes, as this
 * would cause the dependency to be resolved before the tenant context is established.
 * Instead, use lazy injection (e.g., `di.get(Service)` inside methods) to ensure the
 * tenant context is available when the service is accessed.
 */
export function TenantAgnostic<T extends { new (...args: any[]): object }>(constructor: T) {
  injectable()(constructor);

  return constructor;
}
