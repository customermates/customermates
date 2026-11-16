"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";

import { useTranslations } from "next-intl";

import { InfoRow } from "@/components/shared/info-row";

export function AccountConnectionDetails({ account }: { account: Pick<ConnectedAccountDto, "connectionDetails"> }) {
  const t = useTranslations();
  const details = account.connectionDetails;
  if (!details) return null;

  return (
    <>
      {Object.entries(details.products).map(([product, status]) => (
        <InfoRow
          key={product}
          label={
            product === "gmail"
              ? t("ConnectedAccountsCard.channels.gmail")
              : product === "calendar"
                ? t("ConnectedAccountsCard.subTypeCalendar")
                : product
          }
        >
          {status === "running"
            ? t("ConnectedAccountsCard.statusLabels.ok")
            : status === "disconnected"
              ? t("ConnectedAccountsCard.statusLabels.credentials")
              : t("ConnectedAccountsCard.statusLabels.error")}
        </InfoRow>
      ))}

      {(details.reason || (details.status && details.status !== "running")) && (
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs text-muted-foreground">{t("ConnectedAccountsCard.providerReason")}</p>

          <p className="text-sm break-words">
            {details.reason ?? t("ConnectedAccountsCard.providerReasonUnavailable")}
          </p>
        </div>
      )}
    </>
  );
}
