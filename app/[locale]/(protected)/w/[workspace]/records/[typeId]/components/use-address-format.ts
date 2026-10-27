"use client";

import type { AddressCountryFormat, AddressFormatSource } from "@/features/addresses/address-country-format";

import { useEffect, useState } from "react";

let loading: Promise<AddressFormatSource> | null = null;

function loadAddressFormats(): Promise<AddressFormatSource> {
  loading ??= import("@/features/addresses/address-metadata").then(
    (metadata) => metadata.addressFormatOf,
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

export function useAddressFormat(countryCode: string | null): AddressCountryFormat | null {
  const [formatOf, setFormatOf] = useState<AddressFormatSource | null>(null);
  useEffect(() => {
    let active = true;
    loadAddressFormats().then(
      (source) => {
        if (active) setFormatOf(() => source);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);
  return formatOf ? formatOf(countryCode) : null;
}
