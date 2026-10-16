"use client";

import type { CSSProperties } from "react";
import type { AddressCandidate } from "@/features/addresses/address-lookup.schema";
import type { AddressCountryFormat } from "@/features/addresses/address-country-format";
import type { AddressFormPart } from "@/features/addresses/address-form-layout";
import type { AddressDraftParts } from "@/features/records/record-input-value";
import type { RecordFieldView } from "@/features/records/record-model.schema";

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { useAppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { addressAutofill, addressFormRows } from "@/features/addresses/address-form-layout";
import { addressDraftParts, isVerifiedAddressDraft, verifiedAddressDraft } from "@/features/records/record-input-value";
import { addressCountryLabel } from "@/features/records/record-address-value";
import { RecordAddressCheckStore } from "./record-address-check.store";
import { RecordAddressIssues } from "./record-address-issues";
import { RecordAddressLookupStore, addressCheckKey } from "./record-address-lookup.store";
import { addressRegionOptions, addressRegionOptionValue } from "./record-address-region-options";
import { RecordAddressSearch } from "./record-address-search";
import { RecordAddressStatus } from "./record-address-status";
import { useAddressFormat } from "./use-address-format";

const COLUMN_WIDTHS: Readonly<Record<AddressFormPart, string>> = {
  street: "minmax(0,1fr)",
  line2: "minmax(0,1fr)",
  city: "minmax(0,1fr)",
  postalCode: "minmax(0,8rem)",
  region: "minmax(0,11rem)",
};

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
  const [checks] = useState(() => new RecordAddressCheckStore());
  const autofilled = useRef<string | null>(null);
  const draft = store?.getValue(id);
  const parts = addressDraftParts(draft);
  const format = useAddressFormat(parts.countryCode);
  const hasParts = Object.values(parts).some(Boolean);
  const verified = isVerifiedAddressDraft(draft);
  const editable = Boolean(store) && !store?.isReadOnly;
  const searchable = root.addressLookupAvailable && editable;
  const busy = Boolean(store?.isLoading);
  const partsKey = addressCheckKey(parts);
  const result = editable && !verified ? checks.resultFor(parts) : null;

  useEffect(() => {
    if (!editable || verified) checks.reset();
    else checks.schedule(JSON.parse(partsKey) as AddressDraftParts);
  }, [checks, editable, verified, partsKey]);

  useEffect(() => () => checks.reset(), [checks]);

  useEffect(() => {
    if (!result || !store) return;
    const current = addressDraftParts(store.getValue(id));
    const marker = `${current.countryCode ?? ""}:${current.postalCode ?? ""}`;
    if (autofilled.current === marker || addressCheckKey(current) !== partsKey) return;
    const fill = addressAutofill(result, current, format);
    if (!fill) return;
    autofilled.current = marker;
    if (fill.city) store.onChange(`${id}.city`, fill.city);
    if (fill.region && format) store.onChange(`${id}.region`, addressRegionOptionValue(format, fill.region));
  }, [result, store, id, format, partsKey]);

  const pick = (candidate: AddressCandidate) => {
    store?.onChange(id, verifiedAddressDraft(addressDraftParts(candidate.address), candidate.candidateToken));
    lookup.dismissCheck();
  };
  const patch = (values: Partial<AddressDraftParts>) => {
    for (const [part, value] of Object.entries(values)) store?.onChange(`${id}.${part}`, value);
  };
  const partLabel = (part: AddressFormPart | "countryCode"): string => addressPartLabel(t, format, part);
  const summary = [
    parts.street,
    parts.line2,
    [parts.postalCode, parts.city].filter(Boolean).join(" "),
    parts.region,
    parts.countryCode ? addressCountryLabel(parts.countryCode, locale) : null,
  ]
    .filter(Boolean)
    .join(", ");
  const regionOptions = format?.regions.length ? addressRegionOptions(format, parts.region) : null;

  const partInput = (part: AddressFormPart) => {
    if (part === "region" && regionOptions) {
      return (
        <FormAutocomplete<{ key: string; label: string }>
          key={part}
          id={`${id}.region`}
          items={regionOptions}
          label={partLabel(part)}
          renderValue={(selected) =>
            selected.map((item) => <AppChip key={item.key}>{item.data?.label ?? item.key}</AppChip>)
          }
        >
          {(option) => FormAutocompleteItem({ children: option.label, textValue: option.label })}
        </FormAutocomplete>
      );
    }
    return <FormInput key={part} id={`${id}.${part}`} label={partLabel(part)} />;
  };

  const partFields = (
    <div className="space-y-2">
      <FormAutocompleteCountry
        id={`${id}.countryCode`}
        inputId={searchable ? undefined : inputId}
        label={t("RecordModel.addressParts.country")}
      />

      {addressFormRows(format, parts).map((row) =>
        row.length === 1 ? (
          partInput(row[0])
        ) : (
          <div
            key={row.join(":")}
            className="grid grid-cols-(--address-columns) gap-2"
            style={{ "--address-columns": row.map((part) => COLUMN_WIDTHS[part]).join(" ") } as CSSProperties}
          >
            {row.map(partInput)}
          </div>
        ),
      )}

      {result && (
        <RecordAddressIssues
          disabled={busy}
          format={format}
          locale={locale}
          partLabel={partLabel}
          parts={parts}
          result={result}
          onUse={patch}
        />
      )}
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

      {hasParts && (searchable || verified) && (
        <RecordAddressStatus
          canCheck={searchable && !busy}
          lookup={lookup}
          parts={parts}
          verified={verified}
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

type Translate = ReturnType<typeof useTranslations>;

function addressPartLabel(t: Translate, format: AddressCountryFormat | null, part: AddressFormPart | "countryCode") {
  const local = Boolean(format?.countryCode);
  switch (part) {
    case "street":
      return t("RecordModel.addressParts.street");
    case "line2":
      return t("RecordModel.addressParts.line2");
    case "countryCode":
      return t("RecordModel.addressParts.country");
    case "postalCode":
      if (!local || !format) return t("RecordModel.addressParts.postalCode");
      switch (format.postalCodeLabel) {
        case "zip":
          return t("RecordModel.addressLabels.zip");
        case "pin":
          return t("RecordModel.addressLabels.pin");
        case "eircode":
          return t("RecordModel.addressLabels.eircode");
        default:
          return t("RecordModel.addressParts.postalCode");
      }
    case "city":
      if (!local || !format) return t("RecordModel.addressParts.city");
      switch (format.cityLabel) {
        case "district":
          return t("RecordModel.addressLabels.district");
        case "post_town":
          return t("RecordModel.addressLabels.postTown");
        case "suburb":
          return t("RecordModel.addressLabels.suburb");
        default:
          return t("RecordModel.addressParts.city");
      }
    case "region":
      if (!local || !format) return t("RecordModel.addressParts.region");
      return regionLabel(t, format.regionLabel);
  }
}

function regionLabel(t: Translate, label: AddressCountryFormat["regionLabel"]): string {
  switch (label) {
    case "area":
      return t("RecordModel.addressLabels.area");
    case "county":
      return t("RecordModel.addressLabels.county");
    case "department":
      return t("RecordModel.addressLabels.department");
    case "district":
      return t("RecordModel.addressLabels.district");
    case "do_si":
      return t("RecordModel.addressLabels.doSi");
    case "emirate":
      return t("RecordModel.addressLabels.emirate");
    case "island":
      return t("RecordModel.addressLabels.island");
    case "oblast":
      return t("RecordModel.addressLabels.oblast");
    case "parish":
      return t("RecordModel.addressLabels.parish");
    case "prefecture":
      return t("RecordModel.addressLabels.prefecture");
    case "province":
      return t("RecordModel.addressLabels.province");
    case "state":
      return t("RecordModel.addressLabels.state");
  }
}
