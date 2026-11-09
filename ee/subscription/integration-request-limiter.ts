import type { ApiRateLimitService } from "./api-rate-limit.service";

import { headers } from "next/headers";

import { ApiRateLimitExceededError } from "@/core/auth/api-rate-limit-exceeded-error";
import { FREE_PLAN_UPGRADE_PLAN } from "@/core/commercial/plan-catalog";
import { upgradeOfferPrice } from "./plan-upgrade-offer";

const admittedRequests = new WeakSet<object>();

async function currentRequest(): Promise<object | null> {
  try {
    return await headers();
  } catch {
    return null;
  }
}

export class IntegrationRequestLimiter {
  constructor(
    private readonly limiter: Pick<ApiRateLimitService, "admit">,
    private readonly request: () => Promise<object | null> = currentRequest,
  ) {}

  async admit(companyId: string): Promise<void> {
    const request = await this.request();
    if (request) {
      if (admittedRequests.has(request)) return;
      admittedRequests.add(request);
    }
    const refused = await this.limiter.admit(companyId);
    if (!refused) return;
    throw new ApiRateLimitExceededError(refused.window, refused.limit, refused.retryAfterSeconds, {
      plan: FREE_PLAN_UPGRADE_PLAN.charAt(0).toUpperCase() + FREE_PLAN_UPGRADE_PLAN.slice(1),
      price: upgradeOfferPrice(FREE_PLAN_UPGRADE_PLAN, "en"),
    });
  }
}
