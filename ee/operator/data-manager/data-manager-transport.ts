import type { DataManagerCredentials } from "./data-manager-config";
import type { DataManagerIngestBody } from "./data-manager-request";

export type DataManagerIngestOutcome =
  | { result: "submitted"; httpStatus: number; requestId: string }
  | { result: "rejected"; httpStatus: number; errorStatus: string | null }
  | { result: "ambiguous"; httpStatus: number | null };

export type DataManagerAccessTokenOutcome =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "authorizationFailed" | "unavailable" };

export abstract class DataManagerTransport {
  abstract accessToken(credentials: DataManagerCredentials): Promise<DataManagerAccessTokenOutcome>;
  abstract ingest(body: DataManagerIngestBody, accessToken: string): Promise<DataManagerIngestOutcome>;
}
