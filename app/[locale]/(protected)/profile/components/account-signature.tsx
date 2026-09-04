"use client";

import type { ConnectedAccountDto } from "@/ee/messaging/messaging.schema";
import type { SignatureFields } from "@/ee/messaging/signature-fields";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmailFrame } from "@/app/[locale]/(protected)/inbox/components/email-frame";
import { renderSignature } from "@/ee/messaging/outbound/email-signature";
import {
  DEFAULT_ACCENT_HEX,
  SIGNATURE_FONT_SIZE_MAX,
  SIGNATURE_FONT_SIZE_MIN,
  SIGNATURE_LOGO_URL,
  SignatureTemplate,
  SignatureWeight,
} from "@/ee/messaging/signature-fields";

import { SignatureColorField } from "./signature-color-field";
import { SignatureTemplatePicker } from "./signature-template-picker";

type Draft = { signature: string; fields: SignatureFields };

type Props = {
  account: ConnectedAccountDto;
  disabled?: boolean;
  onSave: (signature: string, fields: SignatureFields) => void;
};

const TEXT_FIELDS = ["fullName", "jobTitle", "company", "email", "phone", "website"] as const;

function initialDraft(account: ConnectedAccountDto): Draft {
  const owner = [account.owner.firstName, account.owner.lastName].filter(Boolean).join(" ");

  return {
    signature: account.signature ?? "",
    fields: account.signatureFields ?? {
      template: SignatureTemplate.stacked,
      accentHex: DEFAULT_ACCENT_HEX,
      fontSize: 13,
      fontWeight: SignatureWeight.bold,
      fullName: owner,
      jobTitle: "",
      company: "",
      email: account.emailAddress ?? "",
      phone: "",
      website: "",
      logoUrl: SIGNATURE_LOGO_URL,
    },
  };
}

export function AccountSignature({ account, disabled = false, onSave }: Props) {
  const t = useTranslations();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(account));
  const [saved, setSaved] = useState(() => JSON.stringify(initialDraft(account)));

  useEffect(() => {
    setDraft(initialDraft(account));
    setSaved(JSON.stringify(initialDraft(account)));
  }, [account]);

  const html = useMemo(() => renderSignature(draft.signature, draft.fields)?.html ?? "", [draft]);
  const isDirty = JSON.stringify(draft) !== saved;

  function setField<Key extends keyof SignatureFields>(key: Key, value: SignatureFields[Key]) {
    setDraft((current) => ({ ...current, fields: { ...current.fields, [key]: value } }));
  }

  return (
    <div className="flex flex-col gap-4">
      <SignatureTemplatePicker
        disabled={disabled}
        value={draft.fields.template}
        onValueChange={(template) => setField("template", template)}
      />

      <div className="grid grid-cols-2 gap-3">
        {TEXT_FIELDS.map((field) => (
          <div key={field} className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-subdued text-xs" htmlFor={`signature-${field}`}>
              {t(`ConnectedAccountsCard.signatureFields.${field}`)}
            </Label>

            <Input
              disabled={disabled}
              id={`signature-${field}`}
              value={draft.fields[field]}
              onChange={(event) => setField(field, event.target.value)}
            />
          </div>
        ))}

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className="text-subdued text-xs" htmlFor="signature-fontSize">
            {t("ConnectedAccountsCard.signatureFontSize")}
          </Label>

          <Input
            disabled={disabled}
            id="signature-fontSize"
            max={SIGNATURE_FONT_SIZE_MAX}
            min={SIGNATURE_FONT_SIZE_MIN}
            type="number"
            value={draft.fields.fontSize}
            onChange={(event) => setField("fontSize", Number(event.target.value))}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className="text-subdued text-xs" htmlFor="signature-fontWeight">
            {t("ConnectedAccountsCard.signatureFontWeight")}
          </Label>

          <Select
            disabled={disabled}
            value={draft.fields.fontWeight}
            onValueChange={(next) => setField("fontWeight", next as SignatureWeight)}
          >
            <SelectTrigger id="signature-fontWeight">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              {Object.values(SignatureWeight).map((weight) => (
                <SelectItem key={weight} value={weight}>
                  {t(`ConnectedAccountsCard.signatureWeights.${weight}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label className="text-subdued text-xs" htmlFor="signature-logoUrl">
            {t("ConnectedAccountsCard.signatureFields.logoUrl")}
          </Label>

          <div className="flex min-w-0 items-center gap-1.5">
            <Input
              className="min-w-0 flex-1"
              disabled={disabled}
              id="signature-logoUrl"
              placeholder={t("ConnectedAccountsCard.signatureLogoPlaceholder")}
              value={draft.fields.logoUrl}
              onChange={(event) => setField("logoUrl", event.target.value)}
            />

            <Button
              disabled={disabled || draft.fields.logoUrl === SIGNATURE_LOGO_URL}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => setField("logoUrl", SIGNATURE_LOGO_URL)}
            >
              {t("ConnectedAccountsCard.signatureLogoDefault")}
            </Button>
          </div>
        </div>
      </div>

      <SignatureColorField
        disabled={disabled}
        value={draft.fields.accentHex}
        onValueChange={(next) => setField("accentHex", next)}
      />

      <div className="flex flex-col gap-1.5">
        <Label className="text-subdued text-xs" htmlFor="connected-account-signature">
          {t("ConnectedAccountsCard.signatureExtra")}
        </Label>

        <Textarea
          className="min-h-20 font-mono text-xs"
          disabled={disabled}
          id="connected-account-signature"
          rows={4}
          value={draft.signature}
          onChange={(event) => setDraft((current) => ({ ...current, signature: event.target.value }))}
        />

        <p className="text-muted-foreground text-xs">{t("ConnectedAccountsCard.signatureHint")}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-subdued text-xs">{t("ConnectedAccountsCard.signaturePreview")}</Label>

        {html ? (
          <div className="border-border overflow-hidden rounded-md border">
            <EmailFrame showRemoteImages html={html} />
          </div>
        ) : (
          <p className="text-subdued border-border rounded-md border px-3 py-2 text-xs">
            {t("ConnectedAccountsCard.signaturePreviewEmpty")}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          disabled={disabled || !isDirty}
          size="sm"
          type="button"
          onClick={() => onSave(draft.signature, draft.fields)}
        >
          {t("ConnectedAccountsCard.signatureSave")}
        </Button>
      </div>
    </div>
  );
}
