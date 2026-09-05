"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_LINK_HEX, emailLinkContrast, isEmailLinkHex } from "@/ee/messaging/email-settings";

type Props = {
  disabled?: boolean;
  value: string;
  onValueChange: (value: string) => void;
};

export function EmailLinkColorField({ disabled = false, value, onValueChange }: Props) {
  const t = useTranslations();
  const normalized = value.toLowerCase();
  const valid = isEmailLinkHex(value);
  const contrast = valid ? emailLinkContrast(normalized) : null;
  const descriptionId = !valid
    ? "email-linkHex-error"
    : contrast && !contrast.readable
      ? "email-linkHex-contrast"
      : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-subdued text-xs" htmlFor="email-linkHex">
        {t("ConnectedAccountsCard.emailLinkColour")}
      </Label>

      <div className="flex min-w-0 items-center gap-2">
        <Input
          aria-describedby={descriptionId}
          aria-invalid={!valid}
          autoComplete="off"
          className="flex-1 font-mono"
          disabled={disabled}
          id="email-linkHex"
          maxLength={7}
          placeholder={t("ConnectedAccountsCard.emailLinkColourPlaceholder")}
          spellCheck={false}
          value={value}
          onChange={(event) => onValueChange(event.target.value.trim())}
        />

        <input
          aria-label={t("ConnectedAccountsCard.emailLinkColourPicker")}
          className="border-input bg-input-background focus-visible:ring-ring/50 size-9 shrink-0 cursor-pointer rounded-md border p-1 outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          type="color"
          value={valid ? normalized : DEFAULT_LINK_HEX}
          onChange={(event) => onValueChange(event.target.value)}
        />
      </div>

      {!valid && (
        <p aria-live="polite" className="text-destructive text-xs" id="email-linkHex-error">
          {t("ConnectedAccountsCard.emailLinkColourInvalid")}
        </p>
      )}

      {contrast && !contrast.readable && (
        <p aria-live="polite" className="text-warning text-xs" id="email-linkHex-contrast">
          {t("ConnectedAccountsCard.emailLinkColourLowContrast", {
            light: contrast.light.toFixed(1),
            dark: contrast.dark.toFixed(1),
          })}
        </p>
      )}
    </div>
  );
}
