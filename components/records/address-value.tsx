"use client";

import type { ContactClickAction } from "@/components/records/contact-value";
import type { RecordAddress } from "@/features/records/record-model.schema";

import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { ContactValue } from "@/components/records/contact-value";
import { useRecordAddressLines } from "@/components/records/use-record-address-lines";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/core/utils/cn";
import { addressCountryLabel, addressDisplayText } from "@/features/records/record-address-value";

export function AddressValue({
  address,
  action,
  locale,
  wrap,
}: {
  address: RecordAddress;
  action: ContactClickAction;
  locale: string;
  wrap: boolean;
}) {
  const t = useTranslations();
  const lines = useRecordAddressLines(address, wrap);
  const text = addressDisplayText(address, locale);
  const country = address.countryCode ? addressCountryLabel(address.countryCode, locale) : null;
  const verified = address.verification.status === "verified";

  return (
    <span
      className={cn("inline-flex min-w-0 max-w-full items-baseline gap-1.5", wrap && "flex-wrap")}
      data-address-verification={address.verification.status}
    >
      <ContactValue
        action={action}
        kind="address"
        label={lines ? [...lines, ...(country ? [country] : [])].join("\n") : text}
        value={text}
        wrap={wrap}
      />

      {verified ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label={t("RecordModel.addressVerified")}
              className="inline-flex shrink-0 text-success"
              role="img"
            >
              <BadgeCheck aria-hidden className="size-3.5" />
            </span>
          </TooltipTrigger>

          <TooltipContent>{t("RecordModel.addressVerified")}</TooltipContent>
        </Tooltip>
      ) : (
        wrap && <span className="shrink-0 text-xs text-muted-foreground">{t("RecordModel.addressUnverified")}</span>
      )}
    </span>
  );
}
