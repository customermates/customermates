"use client";

import { useTranslations } from "next-intl";

import { FormSelect } from "@/components/forms/form-select";
import { SignatureDivider, SignatureLogoSize, SignatureSpacing } from "@/ee/messaging/email-settings";

export function SignatureLayoutOptions() {
  const t = useTranslations();
  return (
    <details className="group min-w-0">
      <summary className="cursor-pointer text-sm font-medium">{t("ConnectedAccountsCard.emailLayoutOptions")}</summary>

      <div className="flex min-w-0 flex-col gap-3 pt-3">
        <FormSelect
          id="settings.signature.logoSize"
          items={[
            {
              value: SignatureLogoSize.small,
              label: t("ConnectedAccountsCard.emailLogoSizes.small"),
            },
            {
              value: SignatureLogoSize.medium,
              label: t("ConnectedAccountsCard.emailLogoSizes.medium"),
            },
            {
              value: SignatureLogoSize.large,
              label: t("ConnectedAccountsCard.emailLogoSizes.large"),
            },
          ]}
          label={t("ConnectedAccountsCard.emailLogoSize")}
        />

        <FormSelect
          id="settings.signature.divider"
          items={[
            {
              value: SignatureDivider.none,
              label: t("ConnectedAccountsCard.emailDividers.none"),
            },
            {
              value: SignatureDivider.line,
              label: t("ConnectedAccountsCard.emailDividers.line"),
            },
          ]}
          label={t("ConnectedAccountsCard.emailDivider")}
        />

        <FormSelect
          id="settings.signature.spacing"
          items={[
            {
              value: SignatureSpacing.compact,
              label: t("ConnectedAccountsCard.emailSpacings.compact"),
            },
            {
              value: SignatureSpacing.comfortable,
              label: t("ConnectedAccountsCard.emailSpacings.comfortable"),
            },
          ]}
          label={t("ConnectedAccountsCard.emailSpacing")}
        />
      </div>
    </details>
  );
}
