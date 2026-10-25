import type { AppMode } from "@/core/config/environment";

import { RECORD_FILE_CLOUD_MAX_BYTES } from "./record-file.schema";

export function recordFileMaxUploadBytes(appMode: AppMode, configuredBytes: number): number {
  return appMode === "cloud" ? Math.min(configuredBytes, RECORD_FILE_CLOUD_MAX_BYTES) : configuredBytes;
}
