"use client";

import type { PublicLinkStatus } from "@/features/public-link/public-link.schema";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyToClipboard } from "@/core/utils/clipboard";
import { runUserAction } from "@/core/errors/report-application-error";

type Props = {
  kind: "dashboard" | "list";
  link: NonNullable<PublicLinkStatus["link"]> | null;
  expiresAt: string | null;
  onExpiresAtChange: (value: string | null) => void;
};

export function PublicLinkOption({ kind, link, expiresAt, onExpiresAtChange }: Props) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-1 flex flex-col gap-2" id="share-view-public">
      {link ? (
        <div className="flex gap-2">
          <Input
            readOnly
            aria-label={t("DataView.share.public.linkLabel")}
            className="font-mono text-xs"
            id="share-view-public-link"
            value={link.url}
          />

          <Button
            id="share-view-public-copy"
            type="button"
            variant="secondary"
            onClick={() =>
              runUserAction(async () => {
                if (await copyToClipboard(link.url)) setCopied(true);
              })
            }
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}

            {copied ? t("DataView.share.public.copied") : t("DataView.share.public.copy")}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground" id="share-view-public-pending">
          {t("DataView.share.public.saveToCreate")}
        </p>
      )}

      <FormIsoDatePicker
        id="share-view-public-expires"
        label={t("DataView.share.public.expiresLabel")}
        placeholder={t("DataView.share.public.noExpiry")}
        value={expiresAt ?? undefined}
        onValueChange={(value) => onExpiresAtChange(value ?? null)}
      />

      <p className="text-xs text-muted-foreground" id="share-view-public-meta">
        {[
          link ? t("DataView.share.public.opened", { count: link.openCount }) : null,
          kind === "list" ? t("DataView.share.public.onlyColumns") : t("DataView.share.public.onlyCharts"),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}
