import type { AddressCheckResult } from "@/features/addresses/address-check.schema";
import type { AddressDraftParts } from "@/features/records/record-input-value";

import { action, makeObservable, observable, runInAction } from "mobx";

import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { Debouncer } from "@/core/utils/debounce";
import { checkAddressAction } from "../../actions";
import { addressCheckKey } from "./record-address-lookup.store";

const ADDRESS_CHECK_DEBOUNCE_MS = 400;
const POSTAL_CODES_LOADING_RETRY_MS = 4_000;
const POSTAL_CODES_LOADING_RETRIES = 5;

type AddressCheckView = { key: string; result: AddressCheckResult };

function checkable(parts: AddressDraftParts): boolean {
  return Boolean(parts.countryCode || parts.postalCode || parts.region);
}

export class RecordAddressCheckStore {
  current: AddressCheckView | null = null;
  private generation = 0;
  private scheduledKey: string | null = null;
  private debouncer = new Debouncer(ADDRESS_CHECK_DEBOUNCE_MS);
  private retry: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    makeObservable(this, { current: observable.ref, reset: action });
  }

  schedule = (parts: AddressDraftParts) => {
    const key = addressCheckKey(parts);
    if (key === this.scheduledKey) return;
    this.scheduledKey = key;
    this.stop();
    const generation = ++this.generation;
    if (!checkable(parts)) {
      runInAction(() => {
        this.current = null;
      });
      return;
    }
    this.debouncer.run(() => void this.run(generation, key, parts, 0));
  };

  resultFor(parts: AddressDraftParts): AddressCheckResult | null {
    return this.current?.key === addressCheckKey(parts) ? this.current.result : null;
  }

  reset = () => {
    this.stop();
    this.generation += 1;
    this.scheduledKey = null;
    this.current = null;
  };

  private stop() {
    this.debouncer.cancel();
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
  }

  private run = async (generation: number, key: string, parts: AddressDraftParts, attempt: number) => {
    let result: Awaited<ReturnType<typeof checkAddressAction>> | null = null;
    try {
      result = await checkAddressAction(parts);
    } catch (error) {
      if (notifyIfWorkspaceChanged(error)) return;
    }
    if (notifyIfWorkspaceChanged(result) || generation !== this.generation || !result?.ok) return;
    runInAction(() => {
      this.current = { key, result: result.data };
    });
    if (result.data.postalCode.status === "loading" && attempt < POSTAL_CODES_LOADING_RETRIES)
      this.retry = setTimeout(() => void this.run(generation, key, parts, attempt + 1), POSTAL_CODES_LOADING_RETRY_MS);
  };
}
