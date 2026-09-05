"use client";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { FormInput } from "@/components/forms/form-input";
import { useAppForm } from "@/components/forms/form-context";
import { DEFAULT_LINK_HEX, emailLinkContrast, isEmailLinkHex } from "@/ee/messaging/email-settings";

export const EmailLinkColorField = observer(() => {
  const t = useTranslations();
  const store = useAppForm();
  const id = "settings.appearance.linkHex";
  const value = String(store?.getValue(id) ?? "");
  const disabled = store?.isDisabled;
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
      <FormInput
        aria-describedby={descriptionId}
        aria-invalid={!valid}
        autoComplete="off"
        className="font-mono"
        endContent={
          <input
            aria-label={t("ConnectedAccountsCard.emailLinkColourPicker")}
            className="border-input bg-input-background focus-visible:ring-ring/50 size-9 shrink-0 cursor-pointer rounded-md border p-1 outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            type="color"
            value={valid ? normalized : DEFAULT_LINK_HEX}
            onChange={(event) => store?.onChange(id, event.target.value)}
          />
        }
        id={id}
        label={t("ConnectedAccountsCard.emailLinkColour")}
        maxLength={7}
        placeholder={t("ConnectedAccountsCard.emailLinkColourPlaceholder")}
        spellCheck={false}
      />

      {!valid && (
        <p aria-live="polite" className="text-destructive text-xs" id="email-linkHex-error">
          {t("Common.errors.emailLinkColourInvalid")}
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
});
