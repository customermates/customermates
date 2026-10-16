import type { AddressIssue } from "@/features/addresses/address-check";
import type { RecordAddress } from "./record-model.schema";

export type RecordAddressCheck = { address: RecordAddress; issues: AddressIssue[] };

export interface RecordAddressChecker {
  check(address: RecordAddress): Promise<RecordAddressCheck>;
}
