import type { DataManagerCredentials } from "./data-manager-config";
import type { DataManagerIngestBody } from "./data-manager-request";

export type DataManagerIngestOutcome =
  | { result: "accepted"; httpStatus: number; requestId: string }
  | { result: "rejected"; httpStatus: number; errorStatus: string | null }
  | { result: "ambiguous"; httpStatus: number | null };

export abstract class DataManagerTransport {
  abstract accessToken(credentials: DataManagerCredentials): Promise<string | null>;
  abstract ingest(body: DataManagerIngestBody, accessToken: string): Promise<DataManagerIngestOutcome>;
}
