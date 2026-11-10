import type { ApiRateLimitService } from "./api-rate-limit.service";

import { headers } from "next/headers";

import { ApiRateLimitExceededError } from "@/core/auth/api-rate-limit-exceeded-error";
import { FREE_PLAN_UPGRADE_PLAN } from "@/core/commercial/plan-catalog";
import { billingHref } from "@/app/components/navigation/settings-routes";
import { workspaceEntryHref } from "@/core/navigation/workspace-paths";
import { env } from "@/env";
import { upgradeOfferPrice } from "./plan-upgrade-offer";

const admittedRequests = new WeakSet<object>();

async function currentRequest(): Promise<object | null> {
  try {
    return await headers();
  } catch {
    return null;
  }
}

export async function exemptCurrentRequestFromIntegrationLimit(
  request: () => Promise<object | null> = currentRequest,
): Promise<void> {
  const current = await request();
  if (current) admittedRequests.add(current);
}

export function integrationUpgradeUrl(): string {
  return `${env.BASE_URL}${workspaceEntryHref(billingHref(FREE_PLAN_UPGRADE_PLAN))}`;
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
      url: integrationUpgradeUrl(),
    });
  }
}
