"use client";

import type { AddressFormatter } from "@/features/records/record-address-lines";
import type { RecordAddress } from "@/features/records/record-model.schema";

import { useEffect, useState } from "react";

import { addressFormatterOf, recordAddressLines } from "@/features/records/record-address-lines";

let formatter: Promise<AddressFormatter | null> | null = null;

function loadFormatter(): Promise<AddressFormatter | null> {
  formatter ??= import("@fragaria/address-formatter").then(addressFormatterOf).catch(() => null);
  return formatter;
}

export function useRecordAddressLines(address: RecordAddress, enabled: boolean): string[] | null {
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
