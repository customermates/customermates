import type { RecordAddress } from "@/features/records/record-model.schema";

export type AddressLookupQuery = {
  query: string;
  limit: number;
  locale: string;
  countryCode: string | null;
};

export type AddressLookupMatch = {
  name: string | null;
  address: RecordAddress;
};

export type AddressLookupOutcome = { ok: true; matches: AddressLookupMatch[] } | { ok: false };

export interface AddressLookupProvider {
  readonly id: string;
  readonly attribution: string;
  search(query: AddressLookupQuery): Promise<AddressLookupOutcome>;
}
