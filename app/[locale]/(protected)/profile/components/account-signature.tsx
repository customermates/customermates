"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SanitizedHtml } from "@/components/shared/sanitized-html";
import { signatureToHtml } from "@/ee/messaging/outbound/email-signature";

type Props = {
  value: string;
  disabled?: boolean;
  onSave: (signature: string) => void;
};

export function AccountSignature({ value, disabled = false, onSave }: Props) {
  const t = useTranslations();
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const trimmed = draft.trim();
  const html = useMemo(() => (trimmed ? signatureToHtml(trimmed) : ""), [trimmed]);

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-subdued text-xs" htmlFor="connected-account-signature">
        {t("ConnectedAccountsCard.signature")}
      </Label>

      <Textarea
        className="min-h-24 font-mono text-xs"
        disabled={disabled}
        id="connected-account-signature"
        rows={5}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />

      <p className="text-muted-foreground text-xs">{t("ConnectedAccountsCard.signatureHint")}</p>

      <Label className="text-subdued mt-2 text-xs">{t("ConnectedAccountsCard.signaturePreview")}</Label>

      <div className="border-border bg-muted/30 rounded-md border px-3 py-2 text-sm">
        {html ? (
          <SanitizedHtml
            className="[&_a]:text-primary [&_a]:underline [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_hr]:border-border [&_hr]:my-2 [&_img]:max-h-16 [&_img]:w-auto [&_li]:list-disc [&_p]:m-0 [&_p+p]:mt-2 [&_ul]:m-0 [&_ul]:pl-4"
            html={html}
          />
        ) : (
          <p className="text-subdued m-0">{t("ConnectedAccountsCard.signaturePreviewEmpty")}</p>
        )}
      </div>

      <div className="flex justify-end">
        <Button disabled={disabled || draft === value} size="sm" type="button" onClick={() => onSave(draft)}>
          {t("ConnectedAccountsCard.signatureSave")}
        </Button>
      </div>
    </div>
  );
}
