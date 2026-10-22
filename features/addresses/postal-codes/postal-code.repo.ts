import type { PostalCodeRow } from "./geonames-postal-codes";

export type PostalCodeDataStatus = "loading" | "ready" | "failed" | "unavailable";

export type PostalCodeCountryState = {
  countryCode: string;
  status: PostalCodeDataStatus;
  version: string;
  rowCount: number;
  loadedAt: Date | null;
  attemptedAt: Date;
  attempts: number;
  failure: string | null;
};

export abstract class PostalCodeRepo {
  abstract country(countryCode: string): Promise<PostalCodeCountryState | null>;
  abstract claim(
    countryCode: string,
    version: string,
    previous: PostalCodeCountryState | null,
    now: Date,
  ): Promise<boolean>;
  abstract replace(countryCode: string, version: string, rows: readonly PostalCodeRow[], now: Date): Promise<void>;
  abstract fail(countryCode: string, status: "failed" | "unavailable", failure: string, now: Date): Promise<void>;
  abstract places(countryCode: string, keys: readonly string[]): Promise<PostalCodeRow[]>;
}
