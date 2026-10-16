import type { AppMode } from "@/core/config/environment";
import type { SubscriptionPlan } from "@/generated/prisma";

import { fileStorageLimitBytes } from "./record-file-quota";

export type FileStorageUsage = { usedBytes: number; limitBytes: number | null };

export type FileStorageQuotaSources = {
  subscription: () => Promise<{ plan: SubscriptionPlan; enterpriseFileStorageBytesPerUser: number | null } | null>;
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
        appMode: this.appMode,
        plan: subscription?.plan ?? null,
        enterpriseBytesPerUser: subscription?.enterpriseFileStorageBytesPerUser ?? null,
        activeUsers,
      }),
    };
  }
}
