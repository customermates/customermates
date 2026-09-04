"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { EmailSettings } from "@/ee/messaging/email-settings";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { EmailMarkdownEditor } from "@/components/editor/email-markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmailFrame } from "@/app/[locale]/(protected)/inbox/components/email-frame";
import { composeEmailBodies } from "@/ee/messaging/outbound/email-signature";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import {
  EMAIL_FONT_SIZE_MAX,
  EMAIL_FONT_SIZE_MIN,
  EmailFontFamily,
  EmailLinkStyle,
  EmailSettingsSchema,
  isPublicEmailImageUrl,
  SignatureTemplate,
} from "@/ee/messaging/email-settings";

import { EmailLinkColorField } from "./signature-color-field";
import { SignatureTemplatePicker } from "./signature-template-picker";

type Draft = { signature: string; settings: EmailSettings };

type Props = {
  account: ConnectedAccountDto;
  disabled?: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (signature: string, settings: EmailSettings) => Promise<boolean>;
};

function initialDraft(account: ConnectedAccountDto): Draft {
  return {
    signature: account.signature ?? "",
    settings: account.emailSettings,
  };
}

export function AccountSignature({ account, disabled = false, onDirtyChange, onSave }: Props) {
  const t = useTranslations();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(account));
  const [saved, setSaved] = useState(() => JSON.stringify(initialDraft(account)));
  const [saving, setSaving] = useState(false);

  const previewMarkdown = `${t("ConnectedAccountsCard.emailPreviewSample")}\n\n[${t("ConnectedAccountsCard.emailPreviewLink")}](https://example.com)`;
  const html = useMemo(
    () => composeEmailBodies(previewMarkdown, draft.signature, draft.settings, "markdown").html,
    [draft, previewMarkdown],
  );
  const isDirty = JSON.stringify(draft) !== saved;
  const isValid = EmailSettingsSchema.safeParse(draft.settings).success && draft.signature.length <= 2_000;
  const controlsDisabled = disabled || saving;
  const showLogo = draft.settings.signature.template !== SignatureTemplate.plain;
  const logoInvalid =
    draft.settings.signature.enabled && showLogo && !isPublicEmailImageUrl(draft.settings.signature.logoUrl);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  function setAppearance<Key extends keyof EmailSettings["appearance"]>(
    key: Key,
    value: EmailSettings["appearance"][Key],
  ) {
    setDraft((current) => ({
      ...current,
      settings: {
        ...current.settings,
        appearance: { ...current.settings.appearance, [key]: value },
      },
    }));
  }

  function setSignatureSetting<Key extends keyof EmailSettings["signature"]>(
    key: Key,
    value: EmailSettings["signature"][Key],
  ) {
    setDraft((current) => ({
      ...current,
      settings: {
        ...current.settings,
        signature: { ...current.settings.signature, [key]: value },
      },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const didSave = await onSave(draft.signature, draft.settings);
      if (didSave) setSaved(JSON.stringify(draft));
    } catch (error) {
      reportApplicationError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="email-appearance-heading" className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium" id="email-appearance-heading">
            {t("ConnectedAccountsCard.emailAppearanceTitle")}
          </h3>

          <p className="text-muted-foreground text-xs">{t("ConnectedAccountsCard.emailAppearanceDescription")}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-subdued text-xs" htmlFor="email-fontFamily">
              {t("ConnectedAccountsCard.emailFontFamily")}
            </Label>

            <Select
              disabled={controlsDisabled}
              value={draft.settings.appearance.fontFamily}
              onValueChange={(value) => setAppearance("fontFamily", value as EmailFontFamily)}
            >
              <SelectTrigger id="email-fontFamily">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value={EmailFontFamily.sansSerif}>
                  {t("ConnectedAccountsCard.emailFontFamilies.sansSerif")}
                </SelectItem>

                <SelectItem value={EmailFontFamily.serif}>
                  {t("ConnectedAccountsCard.emailFontFamilies.serif")}
                </SelectItem>

                <SelectItem value={EmailFontFamily.monospace}>
                  {t("ConnectedAccountsCard.emailFontFamilies.monospace")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-subdued text-xs" htmlFor="email-fontSize">
              {t("ConnectedAccountsCard.emailFontSize")}
            </Label>

            <Input
              disabled={controlsDisabled}
              id="email-fontSize"
              max={EMAIL_FONT_SIZE_MAX}
              min={EMAIL_FONT_SIZE_MIN}
              type="number"
              value={draft.settings.appearance.fontSize}
              onChange={(event) => setAppearance("fontSize", Number(event.target.value))}
            />
          </div>
        </div>

        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <EmailLinkColorField
            disabled={controlsDisabled}
            value={draft.settings.appearance.linkHex}
            onValueChange={(value) => setAppearance("linkHex", value)}
          />

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-subdued text-xs" htmlFor="email-linkStyle">
              {t("ConnectedAccountsCard.emailLinkStyle")}
            </Label>

            <Select
              disabled={controlsDisabled}
              value={draft.settings.appearance.linkStyle}
              onValueChange={(value) => setAppearance("linkStyle", value as EmailLinkStyle)}
            >
              <SelectTrigger id="email-linkStyle">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value={EmailLinkStyle.underlined}>
                  {t("ConnectedAccountsCard.emailLinkStyles.underlined")}
                </SelectItem>

                <SelectItem value={EmailLinkStyle.plain}>{t("ConnectedAccountsCard.emailLinkStyles.plain")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section aria-labelledby="email-signature-heading" className="border-border flex flex-col gap-3 border-t pt-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium" id="email-signature-heading">
              {t("ConnectedAccountsCard.emailSignatureTitle")}
            </h3>

            <p className="text-muted-foreground text-xs" id="email-signature-description">
              {t("ConnectedAccountsCard.emailSignatureDescription")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Label className="text-xs" htmlFor="email-signature-enabled">
              {t("ConnectedAccountsCard.emailSignatureEnabled")}
            </Label>

            <Switch
              aria-describedby="email-signature-description"
              checked={draft.settings.signature.enabled}
              disabled={controlsDisabled}
              id="email-signature-enabled"
              onCheckedChange={(value) => setSignatureSetting("enabled", value)}
            />
          </div>
        </div>

        {draft.settings.signature.enabled && (
          <>
            <SignatureTemplatePicker
              disabled={controlsDisabled}
              value={draft.settings.signature.template}
              onValueChange={(template) => setSignatureSetting("template", template)}
            />

            {showLogo && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-subdued text-xs" htmlFor="signature-logoUrl">
                  {t("ConnectedAccountsCard.emailLogoUrl")}
                </Label>

                <Input
                  aria-describedby="signature-logoUrl-hint"
                  aria-invalid={logoInvalid}
                  disabled={controlsDisabled}
                  id="signature-logoUrl"
                  placeholder={t("ConnectedAccountsCard.emailLogoPlaceholder")}
                  value={draft.settings.signature.logoUrl}
                  onChange={(event) => setSignatureSetting("logoUrl", event.target.value.trim())}
                />

                <p className="text-muted-foreground text-xs" id="signature-logoUrl-hint">
                  {t("ConnectedAccountsCard.emailLogoHint")}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label className="text-subdued text-xs" htmlFor="connected-account-signature">
                {t("ConnectedAccountsCard.emailSignatureContent")}
              </Label>

              <EmailMarkdownEditor
                appearance={draft.settings.appearance}
                ariaLabel={t("ConnectedAccountsCard.emailSignatureContent")}
                className="min-h-32"
                disabled={controlsDisabled}
                id="connected-account-signature"
                placeholder={t("ConnectedAccountsCard.emailSignaturePlaceholder")}
                value={draft.signature}
                onChange={(value) => setDraft((current) => ({ ...current, signature: value }))}
              />

              <p className="text-muted-foreground text-xs">{t("ConnectedAccountsCard.emailSignatureHint")}</p>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="email-preview-heading" className="border-border flex flex-col gap-1.5 border-t pt-5">
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

      <div className="flex justify-end">
        <Button
          disabled={disabled || saving || !isDirty || !isValid}
          size="sm"
          type="button"
          onClick={() => runUserAction(save)}
        >
          {t("ConnectedAccountsCard.emailSave")}
        </Button>
      </div>
    </div>
  );
}
