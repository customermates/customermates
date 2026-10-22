"use client";

import type { AddressFormatter, RecordAddressParts } from "@/features/records/record-address-lines";

import { useEffect, useState } from "react";

import { addressFormatterOf, recordAddressLines } from "@/features/records/record-address-lines";
import { addressCountryLabel } from "@/features/records/record-address-value";

let formatter: Promise<AddressFormatter | null> | null = null;

function loadFormatter(): Promise<AddressFormatter | null> {
  formatter ??= import("@fragaria/address-formatter").then(addressFormatterOf).catch(() => null);
  return formatter;
}

export function useRecordAddressLines(
  address: RecordAddressParts & { formatted?: string },
  enabled: boolean,
): string[] | null {
  const [loaded, setLoaded] = useState<AddressFormatter | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadFormatter().then((next) => {
      if (active) setLoaded(next);
    });
    return () => {
      active = false;
    };
  }, [enabled]);
  if (!enabled || !loaded) return null;
  const lines = recordAddressLines(loaded, address);
  return lines.length ? lines : address.formatted ? [address.formatted] : null;
}

export function useRecordAddressSummary(parts: RecordAddressParts, locale: string): string {
  const lines = useRecordAddressLines(parts, true) ?? [
    parts.street,
    parts.line2,
    [parts.postalCode, parts.city].filter(Boolean).join(" "),
    parts.region,
  ];
  const country = parts.countryCode ? addressCountryLabel(parts.countryCode, locale) : null;
  return [...lines, country].filter(Boolean).join(", ");
}
