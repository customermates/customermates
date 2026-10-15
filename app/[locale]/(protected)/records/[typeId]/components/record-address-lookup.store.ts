import type { AddressCandidate } from "@/features/addresses/address-lookup.schema";
import type { AddressDraftParts } from "@/features/records/record-input-value";

import { action, makeObservable, observable, runInAction } from "mobx";

import { Debouncer } from "@/core/utils/debounce";
import { lookupAddressAction, verifyAddressAction } from "../../actions";

export const ADDRESS_SEARCH_MIN_LENGTH = 3;
const ADDRESS_SEARCH_LIMIT = 5;
const ADDRESS_SEARCH_DEBOUNCE_MS = 250;

type AddressLookupActions = { lookup: typeof lookupAddressAction; verify: typeof verifyAddressAction };
type ActionFailure = { ok: false; code?: string };

export type AddressSearchStatus = "idle" | "searching" | "ready" | "failed";

export type AddressCheckState =
  | { status: "idle" }
  | { status: "checking"; key: string }
  | { status: "match"; key: string; match: AddressCandidate }
  | { status: "noMatch"; key: string }
  | { status: "failed"; key: string; code: string | null };

export function addressCheckKey(parts: AddressDraftParts): string {
  return JSON.stringify(parts);
}

function failureCode(result: { ok: boolean } | null): string | null {
  return result && !result.ok ? ((result as ActionFailure).code ?? null) : null;
}

export class RecordAddressLookupStore {
  query = "";
  candidates: AddressCandidate[] = [];
  attribution: string | null = null;
  status: AddressSearchStatus = "idle";
  failure: string | null = null;
  check: AddressCheckState = { status: "idle" };
  private generation = 0;
  private checkGeneration = 0;
  private debouncer = new Debouncer(ADDRESS_SEARCH_DEBOUNCE_MS);

  constructor(
    private readonly actions: AddressLookupActions = { lookup: lookupAddressAction, verify: verifyAddressAction },
  ) {
    makeObservable(this, {
      query: observable,
      candidates: observable.ref,
      attribution: observable,
      status: observable,
      failure: observable,
      check: observable.ref,
      setQuery: action,
      reset: action,
      dismissCheck: action,
    });
  }

  setQuery = (query: string) => {
    this.query = query;
    this.generation += 1;
    this.debouncer.cancel();
    this.failure = null;
    if (query.trim().length < ADDRESS_SEARCH_MIN_LENGTH) {
      this.status = "idle";
      this.candidates = [];
      return;
    }
    this.status = "searching";
    const generation = this.generation;
    this.debouncer.run(() => void this.search(generation, query.trim()));
  };

  retry = (): Promise<void> => {
    this.setQuery(this.query);
    return Promise.resolve();
  };

  reset = () => {
    this.debouncer.cancel();
    this.generation += 1;
    this.query = "";
    this.candidates = [];
    this.status = "idle";
    this.failure = null;
  };

  private search = async (generation: number, query: string) => {
    const result = await this.actions.lookup({ query, limit: ADDRESS_SEARCH_LIMIT }).catch(() => null);
    runInAction(() => {
      if (generation !== this.generation) return;
      if (result?.ok) {
        this.candidates = result.data.candidates;
        this.attribution = result.data.attribution;
        this.status = "ready";
        return;
      }
      this.candidates = [];
      this.status = "failed";
      this.failure = failureCode(result);
    });
  };

  checkAddress = async (parts: AddressDraftParts): Promise<void> => {
    const key = addressCheckKey(parts);
    const generation = ++this.checkGeneration;
    runInAction(() => {
      this.check = { status: "checking", key };
    });
    const result = await this.actions.verify(parts).catch(() => null);
    runInAction(() => {
      if (generation !== this.checkGeneration) return;
      if (!result?.ok) this.check = { status: "failed", key, code: failureCode(result) };
      else if (result.data.match) {
        this.attribution = result.data.attribution;
        this.check = { status: "match", key, match: result.data.match };
      } else this.check = { status: "noMatch", key };
    });
  };

  dismissCheck = () => {
    this.checkGeneration += 1;
    this.check = { status: "idle" };
  };
}
