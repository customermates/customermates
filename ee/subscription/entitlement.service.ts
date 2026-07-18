import type { EntitlementFeature } from "@/ee/subscription/entitlements";
import type { SubscriptionStatus, SubscriptionPlan } from "@/generated/prisma";

import type { z } from "zod";
import { getTranslations } from "next-intl/server";

import { createZodError } from "@/core/validation/validation.utils";
import { getEntitlements, isSubscriptionUsable } from "@/ee/subscription/entitlements";
import { env } from "@/env";

type PlanSummary = { status: SubscriptionStatus; trialEndDate: Date | null; plan: SubscriptionPlan };

export abstract class EntitlementSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<PlanSummary>;
}

export type EntitlementDenialCode =
  | "messagingRequiresCloud"
  | "messagingRequiresPro"
  | "sharedAccountsRequiresCloud"
  | "sharedAccountsRequiresBusiness"
  | "paidSubscriptionRequired";

export type EntitlementDenial = { ok: false; error: z.ZodError; code: EntitlementDenialCode };
type Translator = Awaited<ReturnType<typeof getTranslations>>;

const FEATURE_DENIALS: Record<EntitlementFeature, { cloud: EntitlementDenialCode; plan: EntitlementDenialCode }> = {
  messaging: { cloud: "messagingRequiresCloud", plan: "messagingRequiresPro" },
  sharedAccounts: { cloud: "sharedAccountsRequiresCloud", plan: "sharedAccountsRequiresBusiness" },
};

export class EntitlementService {
  constructor(private repo: EntitlementSubscriptionRepo) {}

  async require(feature: EntitlementFeature): Promise<EntitlementDenial | null> {
    const t = await getTranslations();

    if (env.APP_MODE === "self-hosted") return this.denial(t, FEATURE_DENIALS[feature].cloud);

    const subscription = await this.repo.getSubscriptionOrThrow();

    if (!isSubscriptionUsable(subscription)) return this.denial(t, "paidSubscriptionRequired");
    if (!getEntitlements(subscription.plan)[feature]) return this.denial(t, FEATURE_DENIALS[feature].plan);

    return null;
  }

  private denial(t: Translator, code: EntitlementDenialCode): EntitlementDenial {
    return { ok: false, error: createZodError(t(`ConnectedAccountsCard.${code}`)), code };
  }
}
