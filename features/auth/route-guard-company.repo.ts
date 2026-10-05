import type { Subscription } from "@/generated/prisma";

export abstract class RouteGuardCompanyRepo {
  abstract existsUnscoped(companyId: string): Promise<boolean>;
  abstract getSubscriptionOrThrowUnscoped(companyId: string): Promise<Subscription>;
}
