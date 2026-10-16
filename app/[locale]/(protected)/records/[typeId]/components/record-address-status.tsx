"use client";

import type { AddressCandidate } from "@/features/addresses/address-lookup.schema";
import type { AddressDraftParts } from "@/features/records/record-input-value";
import type { RecordAddressLookupStore } from "./record-address-lookup.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { BadgeCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { runUserAction } from "@/core/errors/report-application-error";
import { addressDisplayText } from "@/features/records/record-address-value";
import { addressCheckKey } from "./record-address-lookup.store";

export const RecordAddressStatus = observer(function RecordAddressStatus({
  lookup,
  parts,
  verified,
  canCheck,
  onUse,
}: {
  lookup: RecordAddressLookupStore;
  parts: AddressDraftParts;
  verified: boolean;
  canCheck: boolean;
  onUse: (candidate: AddressCandidate) => void;
}) {
  const t = useTranslations();
  const locale = useHydratedIntlStore().formattingLocale;
  const check = lookup.check.status !== "idle" && lookup.check.key === addressCheckKey(parts) ? lookup.check : null;
  const checkable = canCheck && Boolean(parts.postalCode || parts.city);

  if (verified) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-address-status="verified">
        <BadgeCheck aria-hidden className="size-3.5 shrink-0 text-success" />

        {t("RecordModel.addressVerified")}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-address-status="unverified">
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{t("RecordModel.addressUnverified")}</span>

        {checkable && check?.status !== "match" && (
          <Button
            data-address-check=""
            disabled={check?.status === "checking"}
            size="xs"
            type="button"
            variant="secondary"
            onClick={() => runUserAction(() => lookup.checkAddress(parts))}
          >
            {check?.status === "checking" && <Spinner aria-label={t("RecordModel.addressCheck.checking")} size="sm" />}

            {t("RecordModel.addressCheck.action")}
          </Button>
        )}

        {check?.status === "noMatch" && <span role="status">{t("RecordModel.addressCheck.noMatch")}</span>}

        {check?.status === "failed" && (
          <span role="alert">
            {check.code === "addressLookupRateLimited"
              ? t("Common.errors.addressLookupRateLimited")
              : t("Common.errors.addressLookupUnavailable")}
          </span>
        )}
      </div>

      {check?.status === "match" && (
        <div className="space-y-2 rounded-md border px-3 py-2" data-address-suggestion="" role="status">
          <p className="text-xs text-muted-foreground">{t("RecordModel.addressCheck.suggestion")}</p>

          <p className="text-sm">{addressDisplayText(check.match.address, locale)}</p>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" type="button" onClick={() => onUse(check.match)}>
              {t("RecordModel.addressCheck.use")}
            </Button>

            <Button size="sm" type="button" variant="secondary" onClick={lookup.dismissCheck}>
              {t("RecordModel.addressCheck.keep")}
            </Button>
          </div>

          {lookup.attribution && <p className="text-xs text-muted-foreground">{lookup.attribution}</p>}
        </div>
      )}
    </div>
  );
});
