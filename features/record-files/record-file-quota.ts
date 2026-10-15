import type { AppMode } from "@/core/config/environment";
import type { SubscriptionPlan } from "@/generated/prisma";

import { CLOUD_TRIAL } from "@/core/commercial/plan-catalog";
import { getEffectiveEntitlements } from "@/ee/subscription/entitlements";

export const ENTERPRISE_DEFAULT_FILE_STORAGE_BYTES_PER_USER = 50 * 1024 ** 3;

export type FileStorageQuotaInput = {
  appMode: AppMode;
  plan: SubscriptionPlan | null;
  enterpriseBytesPerUser: number | null;
  activeUsers: number;
};

export function fileStorageLimitBytes({
  appMode,
  plan,
  enterpriseBytesPerUser,
  activeUsers,
}: FileStorageQuotaInput): number | null {
  if (appMode !== "cloud") return null;
  const perUser = getEffectiveEntitlements({ appMode, plan: plan ?? CLOUD_TRIAL.plan }).fileStorageBytesPerActiveUser;
  if (perUser === null) return null;
  const bytes =
    perUser === "contract" ? (enterpriseBytesPerUser ?? ENTERPRISE_DEFAULT_FILE_STORAGE_BYTES_PER_USER) : perUser;
  return bytes * Math.max(1, activeUsers);
}

export function exceedsFileStorageQuota(usedBytes: number, addedBytes: number, limitBytes: number | null): boolean {
  return limitBytes !== null && usedBytes + addedBytes > limitBytes;
}
