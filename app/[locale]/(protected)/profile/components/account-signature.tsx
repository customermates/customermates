"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { AccountSignatureStore } from "./account-signature.store";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { EmailMarkdownEditor } from "@/components/editor/email-markdown-editor";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormLabel } from "@/components/forms/form-label";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { useFormFieldErrors } from "@/components/forms/use-form-field";
import { Button } from "@/components/ui/button";
import { EmailFrame } from "@/features/messaging/email-frame";
import { composeEmailBodies } from "@/ee/messaging/outbound/email-signature";
import { EmailFontFamily, EmailLinkStyle, EmailSettingsSchema, SignatureTemplate } from "@/ee/messaging/email-settings";

import { EmailLinkColorField } from "./signature-color-field";
import { SignatureTemplatePicker } from "./signature-template-picker";
import { SignatureLayoutOptions } from "./signature-layout-options";

type Props = { account: ConnectedAccountDto; store: AccountSignatureStore };

const FieldError = observer(({ id }: { id: string }) => {
  const { errors, hasError } = useFormFieldErrors(id);
  if (!hasError) return null;
  return (
    <p className="text-destructive text-xs" id={`${id}-error`} role="alert">
      {Array.isArray(errors) ? errors.join(" ") : errors}
    </p>
  );
});

export const AccountSignature = observer(({ account, store }: Props) => {
  const t = useTranslations();
  useState(() => store.hydrate(account));
  const { form, isDisabled } = store;
  const settings = form.settings;
  const previewMarkdown = `${t("ConnectedAccountsCard.emailPreviewSample")}\n\n[${t("ConnectedAccountsCard.emailPreviewLink")}](https://example.com)`;
  const parsedSettings = EmailSettingsSchema.safeParse(settings);
  const previewSettings = parsedSettings.success ? parsedSettings.data : store.savedState.settings;
  const html = composeEmailBodies(previewMarkdown, form.signature, previewSettings, "markdown").html;
  const showLogo = settings.signature.template !== SignatureTemplate.plain;

  return (
    <AppForm store={store}>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.9fr)]">
        <fieldset className="flex min-w-0 flex-col gap-6" disabled={isDisabled}>
          <section aria-labelledby="email-appearance-heading" className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium" id="email-appearance-heading">
                {t("ConnectedAccountsCard.emailAppearanceTitle")}
              </h3>

              <p className="text-muted-foreground text-xs">{t("ConnectedAccountsCard.emailAppearanceDescription")}</p>
            </div>

            <FormSelect
              id="settings.appearance.fontFamily"
              items={[
                {
                  value: EmailFontFamily.sansSerif,
                  label: t("ConnectedAccountsCard.emailFontFamilies.sansSerif"),
                },
                {
                  value: EmailFontFamily.serif,
                  label: t("ConnectedAccountsCard.emailFontFamilies.serif"),
                },
                {
                  value: EmailFontFamily.monospace,
                  label: t("ConnectedAccountsCard.emailFontFamilies.monospace"),
                },
              ]}
              label={t("ConnectedAccountsCard.emailFontFamily")}
            />

            <div className="space-y-1.5">
              <FormNumberInput
                aria-describedby={
                  store.getError("settings.appearance.fontSize") ? "settings.appearance.fontSize-error" : undefined
                }
                id="settings.appearance.fontSize"
                label={t("ConnectedAccountsCard.emailFontSize")}
              />

              <FieldError id="settings.appearance.fontSize" />
            </div>

            <EmailLinkColorField />

            <FormSelect
              id="settings.appearance.linkStyle"
              items={[
                {
                  value: EmailLinkStyle.underlined,
                  label: t("ConnectedAccountsCard.emailLinkStyles.underlined"),
                },
                {
                  value: EmailLinkStyle.plain,
                  label: t("ConnectedAccountsCard.emailLinkStyles.plain"),
                },
              ]}
              label={t("ConnectedAccountsCard.emailLinkStyle")}
            />
          </section>

          <section
            aria-labelledby="email-signature-heading"
            className="border-border flex flex-col gap-3 border-t pt-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium" id="email-signature-heading">
                  {t("ConnectedAccountsCard.emailSignatureTitle")}
                </h3>

                <p className="text-muted-foreground text-xs">{t("ConnectedAccountsCard.emailSignatureDescription")}</p>
              </div>

              <FormSwitch id="settings.signature.enabled" label={t("ConnectedAccountsCard.emailSignatureEnabled")} />
            </div>

            {settings.signature.enabled && (
              <>
                <SignatureTemplatePicker
                  disabled={isDisabled}
                  value={settings.signature.template}
                  onValueChange={(template) => store.onChange("settings.signature.template", template)}
                />

                {showLogo && (
                  <>
                    <div className="space-y-1.5">
                      <FormInput
                        aria-describedby={
                          store.getError("settings.signature.logoUrl") ? "settings.signature.logoUrl-error" : undefined
                        }
                        description={t("ConnectedAccountsCard.emailLogoHint")}
                        id="settings.signature.logoUrl"
                        label={t("ConnectedAccountsCard.emailLogoUrl")}
                        placeholder={t("ConnectedAccountsCard.emailLogoPlaceholder")}
                      />

                      <FieldError id="settings.signature.logoUrl" />
                    </div>

                    <SignatureLayoutOptions />
                  </>
                )}

                <div className="flex flex-col gap-1.5">
                  <FormLabel htmlFor="signature">{t("ConnectedAccountsCard.emailSignatureContent")}</FormLabel>

                  <EmailMarkdownEditor
                    appearance={previewSettings.appearance}
                    ariaLabel={t("ConnectedAccountsCard.emailSignatureContent")}
                    className="min-h-32"
                    disabled={isDisabled}
                    id="signature"
                    invalid={Boolean(store.getError("signature"))}
                    placeholder={t("ConnectedAccountsCard.emailSignaturePlaceholder")}
                    value={form.signature}
                    onChange={(value) => store.onChange("signature", value)}
                  />

                  <FieldError id="signature" />

                  <p className="text-muted-foreground text-xs">{t("ConnectedAccountsCard.emailSignatureHint")}</p>
                </div>
              </>
            )}
          </section>
        </fieldset>

        <section
          aria-labelledby="email-preview-heading"
          className="border-border flex min-w-0 flex-col gap-1.5 border-t pt-5 lg:sticky lg:top-0 lg:border-t-0 lg:pt-0"
        >
          <div>
            <h3 className="text-sm font-medium" id="email-preview-heading">
              {t("ConnectedAccountsCard.emailPreviewTitle")}
            </h3>

            <p className="text-muted-foreground text-xs">{t("ConnectedAccountsCard.emailPreviewDescription")}</p>
          </div>

          <div className="border-border overflow-hidden rounded-md border">
            <EmailFrame showRemoteImages html={html} />
          </div>
        </section>

        <div className="flex justify-end lg:col-span-2">
          <Button disabled={isDisabled || !store.hasUnsavedChanges} size="sm" type="submit">
            {t("ConnectedAccountsCard.emailSave")}
          </Button>
        </div>
      </div>
    </AppForm>
  );
});
