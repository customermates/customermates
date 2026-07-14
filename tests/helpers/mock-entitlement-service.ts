import type { EntitlementService } from "@/ee/subscription/entitlement.service";

export function mockEntitlementService(): EntitlementService {
  return {
    require: async () => null,
  } as unknown as EntitlementService;
}
