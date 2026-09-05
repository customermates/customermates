import type { EmailSettings } from "@/ee/messaging/email-settings";

import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignatureDivider, SignatureLogoSize, SignatureSpacing } from "@/ee/messaging/email-settings";

type Props = {
  disabled: boolean;
  value: EmailSettings["signature"];
  onChange: <Key extends keyof EmailSettings["signature"]>(key: Key, value: EmailSettings["signature"][Key]) => void;
};

export function SignatureLayoutOptions({ disabled, value, onChange }: Props) {
  const t = useTranslations();

  return (
    <details className="group min-w-0">
      <summary className="cursor-pointer text-sm font-medium">{t("ConnectedAccountsCard.emailLayoutOptions")}</summary>

      <div className="flex min-w-0 flex-col gap-3 pt-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className="text-subdued text-xs" htmlFor="signature-logoSize">
            {t("ConnectedAccountsCard.emailLogoSize")}
          </Label>

          <Select
            disabled={disabled}
            value={value.logoSize}
            onValueChange={(next) => onChange("logoSize", next as SignatureLogoSize)}
          >
            <SelectTrigger className="w-full" id="signature-logoSize">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value={SignatureLogoSize.small}>{t("ConnectedAccountsCard.emailLogoSizes.small")}</SelectItem>

              <SelectItem value={SignatureLogoSize.medium}>
                {t("ConnectedAccountsCard.emailLogoSizes.medium")}
              </SelectItem>

              <SelectItem value={SignatureLogoSize.large}>{t("ConnectedAccountsCard.emailLogoSizes.large")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className="text-subdued text-xs" htmlFor="signature-divider">
            {t("ConnectedAccountsCard.emailDivider")}
          </Label>

          <Select
            disabled={disabled}
            value={value.divider}
            onValueChange={(next) => onChange("divider", next as SignatureDivider)}
          >
            <SelectTrigger className="w-full" id="signature-divider">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value={SignatureDivider.none}>{t("ConnectedAccountsCard.emailDividers.none")}</SelectItem>

              <SelectItem value={SignatureDivider.line}>{t("ConnectedAccountsCard.emailDividers.line")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className="text-subdued text-xs" htmlFor="signature-spacing">
            {t("ConnectedAccountsCard.emailSpacing")}
          </Label>

          <Select
            disabled={disabled}
            value={value.spacing}
            onValueChange={(next) => onChange("spacing", next as SignatureSpacing)}
          >
            <SelectTrigger className="w-full" id="signature-spacing">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value={SignatureSpacing.compact}>
                {t("ConnectedAccountsCard.emailSpacings.compact")}
              </SelectItem>

              <SelectItem value={SignatureSpacing.comfortable}>
                {t("ConnectedAccountsCard.emailSpacings.comfortable")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </details>
  );
}
