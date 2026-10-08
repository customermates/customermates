import type { ChipColor } from "@/constants/chip-colors";
import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

export function getProviderDisplayLabel(
  account: Pick<ConnectedAccountDto, "provider" | "hasMessaging" | "hasCalendar" | "linkedinProducts">,
  t: (key: string) => string,
): string {
  if (account.provider === "linkedin") {
    if (account.linkedinProducts.includes("sales_navigator"))
      return t("ConnectedAccountsCard.channels.linkedinSalesNavigator");
    if (account.linkedinProducts.includes("recruiter")) return t("ConnectedAccountsCard.channels.linkedinRecruiter");
    return t("ConnectedAccountsCard.channels.linkedinClassic");
  }

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
