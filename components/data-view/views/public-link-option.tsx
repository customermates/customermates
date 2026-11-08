"use client";

import type { PublicLinkStatus } from "@/features/public-link/public-link.schema";

import { useTranslations } from "next-intl";

import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { CopyableCode } from "@/components/shared/copyable-code";
import { Label } from "@/components/ui/label";

type Props = {
  kind: "dashboard" | "list";
  link: NonNullable<PublicLinkStatus["link"]> | null;
  expiresAt: string | null;
  onExpiresAtChange: (value: string | null) => void;
};

export function PublicLinkOption({ kind, link, expiresAt, onExpiresAtChange }: Props) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-3" id="share-view-public">
      {link ? (
        <div className="flex flex-col gap-1.5">
          <Label>{t("DataView.share.public.linkLabel")}</Label>

          <CopyableCode anchorId="share-view-public-copy" id="share-view-public-link" value={link.url} />
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
