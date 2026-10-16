"use client";

import type { AddressCountryFormat } from "@/features/addresses/address-country-format";
import type { AddressCheckResult, AddressIssueOutput } from "@/features/addresses/address-check.schema";
import type { AddressPlaceChoice } from "@/features/addresses/address-form-layout";
import type { AddressDraftParts } from "@/features/records/record-input-value";

import { useTranslations } from "next-intl";
import { CircleAlert, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { addressCountryLabel } from "@/features/records/record-address-value";
import { addressPlaceChoices } from "@/features/addresses/address-form-layout";
import { addressRegionName, addressRegionOptionValue } from "./record-address-region-options";

const GEONAMES_URL = "https://www.geonames.org/";

type Patch = Partial<Pick<AddressDraftParts, "city" | "region">>;

export function RecordAddressIssues({
  result,
  parts,
  format,
  locale,
  partLabel,
  disabled,
  onUse,
}: {
  result: AddressCheckResult;
  parts: AddressDraftParts;
  format: AddressCountryFormat | null;
  locale: string;
  partLabel: (part: AddressIssueOutput["part"]) => string;
  disabled: boolean;
  onUse: (patch: Patch) => void;
}) {
  const t = useTranslations();
  const country = parts.countryCode ? addressCountryLabel(parts.countryCode, locale) : "";
  const regionPatch = (key: string | null): Patch =>
    key && format?.regions.length && !parts.region ? { region: addressRegionOptionValue(format, key) } : {};
  const choices = parts.city ? [] : addressPlaceChoices(result);
  const message = (issue: AddressIssueOutput): string => {
    switch (issue.code) {
      case "countryUnknown":
        return t("RecordModel.addressIssues.countryUnknown");
      case "postalCodeInvalid":
        return t("RecordModel.addressIssues.postalCodeInvalid", { country, example: issue.example ?? "" });
      case "regionInvalid":
        return t("RecordModel.addressIssues.regionInvalid", { region: parts.region ?? "", country });
      case "countryMissing":
        return t("RecordModel.addressIssues.countryMissing");
      case "partMissing":
        return t("RecordModel.addressIssues.partMissing", { part: partLabel(issue.part), country });
      case "regionUnknown":
        return t("RecordModel.addressIssues.regionUnknown", { region: parts.region ?? "", country });
      case "postalCodeRegionMismatch":
        return t("RecordModel.addressIssues.postalCodeRegionMismatch", {
          postalCode: result.address.postalCode ?? "",
        });
      case "cityMismatch":
        return t("RecordModel.addressIssues.cityMismatch", { postalCode: result.address.postalCode ?? "" });
    }
  };
  const fixes = (issue: AddressIssueOutput): Array<{ label: string; patch: Patch }> => {
    if (issue.code === "cityMismatch") {
      return (issue.expected ?? []).slice(0, 3).map((city) => ({
        label: city,
        patch: { city, ...regionPatch(result.postalCode.places.find((place) => place.city === city)?.region ?? null) },
      }));
    }
    if (issue.code === "postalCodeRegionMismatch" && format) {
      return (issue.expected ?? []).slice(0, 3).map((key) => ({
        label: addressRegionName(format, key),
        patch: { region: addressRegionOptionValue(format, key) },
      }));
    }
    return [];
  };
  const fixButton = (label: string, patch: Patch) => (
    <Button key={label} disabled={disabled} size="xs" type="button" variant="secondary" onClick={() => onUse(patch)}>
      {t("RecordModel.addressPlaces.use", { value: label })}
    </Button>
  );
  const choiceButton = (choice: AddressPlaceChoice) =>
    fixButton(choice.city, { city: choice.city, ...regionPatch(choice.region) });

  if (!result.issues.length && !choices.length && !result.attribution) return null;

  return (
    <div aria-live="polite" className="space-y-1.5" data-address-issues="">
      {result.issues.map((issue) => {
        const error = issue.severity === "error";
        const Icon = error ? CircleAlert : TriangleAlert;
        const actions = fixes(issue);
        return (
          <div
            key={`${issue.code}:${issue.part}`}
            className={cn("space-y-1 text-xs", error ? "text-destructive" : "text-warning")}
            data-address-issue={issue.code}
            data-severity={issue.severity}
          >
            <p className="flex items-start gap-1.5">
              <Icon aria-hidden className="mt-px size-3.5 shrink-0" />

              <span>{message(issue)}</span>
            </p>

            {actions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pl-5">
                {actions.map((action) => fixButton(action.label, action.patch))}
              </div>
            )}
          </div>
        );
      })}

      {choices.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground" data-address-places="">
          <p>{t("RecordModel.addressPlaces.choose")}</p>

          <div className="flex flex-wrap gap-1.5">{choices.map(choiceButton)}</div>
        </div>
      )}

      {result.attribution && (
        <p className="text-xs text-muted-foreground">
          <a className="underline-offset-2 hover:underline" href={GEONAMES_URL} rel="noreferrer" target="_blank">
            {t("RecordModel.addressPlaces.attribution")}
          </a>
        </p>
      )}
    </div>
  );
}
