import type { SubscriptionPlan } from "@/generated/prisma";

import { CLOUD_TRIAL, GIB } from "@/core/commercial/plan-catalog";
import { getEntitlements } from "@/ee/subscription/entitlements";

export const ENTERPRISE_DEFAULT_FILE_STORAGE_BYTES_PER_USER = 50 * GIB;

export type FileStorageQuotaInput = {
  plan: SubscriptionPlan | null;
  enterpriseBytesPerUser: number | null;
  activeUsers: number;
};

export function fileStorageLimitBytes({
  plan,
  enterpriseBytesPerUser,
  activeUsers,
}: FileStorageQuotaInput): number | null {
  const perUser = getEntitlements(plan ?? CLOUD_TRIAL.plan).fileStorageBytesPerActiveUser;
  if (perUser === null) return null;
  const bytes =
    perUser === "contract" ? (enterpriseBytesPerUser ?? ENTERPRISE_DEFAULT_FILE_STORAGE_BYTES_PER_USER) : perUser;
  return bytes * Math.max(1, activeUsers);
}

export function exceedsFileStorageQuota(usedBytes: number, addedBytes: number, limitBytes: number | null): boolean {
  return limitBytes !== null && usedBytes + addedBytes > limitBytes;
}
