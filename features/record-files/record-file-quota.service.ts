import type { AppMode } from "@/core/config/environment";
import type { PlanId, PurchasablePlanId } from "@/core/commercial/plan-catalog";

import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";
import { nextStoragePlan } from "@/core/commercial/plan-fit";
import { fileStorageLimitBytes } from "./record-file-quota";

export type FileStorageUsage = { usedBytes: number; limitBytes: number | null };

export type FileStorageQuotaSources = {
  subscription: () => Promise<{ plan: PlanId; enterpriseFileStorageBytesPerUser: number | null } | null>;
  activeUsers: () => Promise<number>;
  usedBytes: () => Promise<number>;
};

export class RecordFileQuotaService {
  constructor(
    private sources: FileStorageQuotaSources,
    private appMode: AppMode,
  ) {}

  async usage(): Promise<FileStorageUsage> {
    const usedBytes = await this.sources.usedBytes();
    if (this.appMode !== "cloud") return { usedBytes, limitBytes: null };
    const [subscription, activeUsers] = await Promise.all([this.sources.subscription(), this.sources.activeUsers()]);
    return {
      usedBytes,
      limitBytes: fileStorageLimitBytes({
        plan: subscription?.plan ?? null,
        enterpriseBytesPerUser: subscription?.enterpriseFileStorageBytesPerUser ?? null,
        activeUsers,
      }),
    };
  }

  async upgradePlan(): Promise<PurchasablePlanId | null> {
    if (this.appMode !== "cloud") return null;
    const subscription = await this.sources.subscription();
    return nextStoragePlan(subscription?.plan ?? CLOUD_TRIAL.plan);
  }
}
