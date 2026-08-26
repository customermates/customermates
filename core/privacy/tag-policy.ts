import type { AppMode } from "@/core/config/environment";
import type { ConsentState } from "./consent";

export function consentTagPolicy(consent: ConsentState | null, appMode: AppMode) {
  return {
    analytics: appMode === "cloud" && consent?.analytics === true,
  };
}
