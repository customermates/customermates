import type { ChipColor } from "@/constants/chip-colors";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

export function getProviderDisplayLabel(
  account: Pick<ConnectedAccountDto, "provider" | "hasMessaging" | "hasCalendar">,
  t: (key: string) => string,
): string {
  const base = t(`Common.providers.${account.provider}`);
  if (account.provider !== "google" && account.provider !== "outlook") return base;
  if (account.hasMessaging && account.hasCalendar) return `${base} · ${t("ConnectedAccountsCard.subTypeBoth")}`;
  if (account.hasCalendar) return `${base} · ${t("ConnectedAccountsCard.subTypeCalendar")}`;
  if (account.hasMessaging) return `${base} · ${t("ConnectedAccountsCard.subTypeEmail")}`;
  return base;
}

export function accountStatusChipColor(status: string): ChipColor {
  switch (status) {
    case "ok":
      return "success";
    case "credentials":
    case "permissions":
      return "warning";
    case "error":
      return "destructive";
    default:
      return "secondary";
  }
}
