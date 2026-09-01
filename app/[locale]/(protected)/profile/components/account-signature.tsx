"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  value: string;
  disabled?: boolean;
  onSave: (signature: string) => void;
};

export function AccountSignature({ value, disabled = false, onSave }: Props) {
  const t = useTranslations();
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  return (
    <div className="flex flex-col gap-2 pt-2">
      <Label className="text-subdued text-xs" htmlFor="connected-account-signature">
        {t("ConnectedAccountsCard.signature")}
      </Label>

      <Textarea
        className="min-h-24"
        disabled={disabled}
        id="connected-account-signature"
        rows={4}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />

      <p className="text-muted-foreground text-xs">{t("ConnectedAccountsCard.signatureHint")}</p>

      <div className="flex justify-end">
        <Button disabled={disabled || draft === value} size="sm" type="button" onClick={() => onSave(draft)}>
          {t("ConnectedAccountsCard.signatureSave")}
        </Button>
      </div>
    </div>
  );
}
