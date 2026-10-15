"use client";

import type { AddressCandidate } from "@/features/addresses/address-lookup.schema";
import type { RecordFieldView } from "@/features/records/record-model.schema";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useAppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { addressDraftParts, isVerifiedAddressDraft, verifiedAddressDraft } from "@/features/records/record-input-value";
import { addressCountryLabel } from "@/features/records/record-address-value";
import { RecordAddressLookupStore } from "./record-address-lookup.store";
import { RecordAddressSearch } from "./record-address-search";
import { RecordAddressStatus } from "./record-address-status";

export const RecordAddressInput = observer(function RecordAddressInput({
  field,
  id,
  inputId,
  label,
}: {
  field: RecordFieldView;
  id: string;
  inputId?: string;
  label?: string | null;
}) {
  const t = useTranslations();
  const store = useAppForm();
  const root = useRootStore();
  const isMobile = useIsMobile();
  const locale = useHydratedIntlStore().formattingLocale;
  const [lookup] = useState(() => new RecordAddressLookupStore());
  const draft = store?.getValue(id);
  const parts = addressDraftParts(draft);
  const hasParts = Object.values(parts).some(Boolean);
  const searchable = root.addressLookupAvailable && Boolean(store) && !store?.isReadOnly;
  const busy = Boolean(store?.isLoading);
  const pick = (candidate: AddressCandidate) => {
    store?.onChange(id, verifiedAddressDraft(addressDraftParts(candidate.address), candidate.candidateToken));
    lookup.dismissCheck();
  };
  const summary = [
    parts.street,
    parts.line2,
    [parts.postalCode, parts.city].filter(Boolean).join(" "),
    parts.region,
    parts.countryCode ? addressCountryLabel(parts.countryCode, locale) : null,
  ]
    .filter(Boolean)
    .join(", ");

  const partFields = (
    <div className="space-y-2">
      <FormInput
        id={`${id}.street`}
        inputId={searchable ? undefined : inputId}
        label={t("RecordModel.addressParts.street")}
      />

      <FormInput id={`${id}.line2`} label={t("RecordModel.addressParts.line2")} />

      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-2">
        <FormInput id={`${id}.postalCode`} label={t("RecordModel.addressParts.postalCode")} />

        <FormInput id={`${id}.city`} label={t("RecordModel.addressParts.city")} />
      </div>

      <FormInput id={`${id}.region`} label={t("RecordModel.addressParts.region")} />

      <FormAutocompleteCountry id={`${id}.countryCode`} label={t("RecordModel.addressParts.country")} />
    </div>
  );

  return (
    <div aria-label={label ?? field.label} className="space-y-2" data-address-input="" role="group">
      {label && (
        <p className="text-xs text-muted-foreground">
          {label}

          {field.required ? <span className="text-destructive"> *</span> : null}
        </p>
      )}

      {searchable && <RecordAddressSearch disabled={busy} inputId={inputId} lookup={lookup} onPick={pick} />}

      {hasParts && (
        <RecordAddressStatus
          canCheck={searchable && !busy}
          lookup={lookup}
          parts={parts}
          verified={isVerifiedAddressDraft(draft)}
          onUse={pick}
        />
      )}

      {isMobile && searchable ? (
        <CollapsibleSection summary={summary || undefined} title={t("RecordModel.addressDetails")}>
          {partFields}
        </CollapsibleSection>
      ) : (
        partFields
      )}
    </div>
  );
});
