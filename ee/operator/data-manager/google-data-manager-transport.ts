import "server-only";

import type { DataManagerCredentials } from "./data-manager-config";
import type { DataManagerIngestBody } from "./data-manager-request";
import type { DataManagerAccessTokenOutcome, DataManagerIngestOutcome } from "./data-manager-transport";

import * as Sentry from "@sentry/nextjs";

import { DATA_MANAGER_INGEST_URL, DATA_MANAGER_SCOPE, DATA_MANAGER_TOKEN_URL } from "./data-manager-request";
import { DataManagerTransport } from "./data-manager-transport";

const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const DEFINITE_REJECTIONS = new Set([400, 401, 403, 404, 413, 429]);
const TOKEN_REFUSALS = new Set([400, 401, 403]);

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function googleErrorStatus(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const error = (payload as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "string" && /^[A-Z_]{1,64}$/u.test(status) ? status : null;
}

function requestIdOf(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const requestId = (payload as { requestId?: unknown }).requestId;
  return typeof requestId === "string" && /^[\w.:-]{1,128}$/u.test(requestId) ? requestId : null;
}

export class GoogleDataManagerTransport extends DataManagerTransport {
  constructor(private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
    super();
  }

  async accessToken(credentials: DataManagerCredentials): Promise<DataManagerAccessTokenOutcome> {
    let response: Response;
    try {
      response = await this.fetchImpl(DATA_MANAGER_TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          refresh_token: credentials.refreshToken,
          scope: DATA_MANAGER_SCOPE,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      });
    } catch (error) {
      Sentry.captureException(error, { level: "warning", tags: { kind: "ad-conversion-upload-token" } });
      return { ok: false, reason: "unavailable" };
    }

    if (TOKEN_REFUSALS.has(response.status)) return { ok: false, reason: "authorizationFailed" };
    if (!response.ok) {
      Sentry.captureMessage("Google token endpoint unavailable for the ad conversion upload", {
        level: "warning",
        tags: { kind: "ad-conversion-upload-token", httpStatus: String(response.status) },
      });
      return { ok: false, reason: "unavailable" };
    }

    const payload = await readJson(response);
    const token =
      typeof payload === "object" && payload !== null ? (payload as { access_token?: unknown }).access_token : null;
    return typeof token === "string" && token.length > 0
      ? { ok: true, accessToken: token }
      : { ok: false, reason: "authorizationFailed" };
  }

  async ingest(body: DataManagerIngestBody, accessToken: string): Promise<DataManagerIngestOutcome> {
    let response: Response;
    try {
      response = await this.fetchImpl(DATA_MANAGER_INGEST_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
      });
    } catch (error) {
      Sentry.captureException(error, { level: "warning", tags: { kind: "ad-conversion-upload-ingest" } });
      return { result: "ambiguous", httpStatus: null };
    }

    const payload = await readJson(response);
    if (response.ok) {
      const requestId = requestIdOf(payload);
      return requestId
        ? { result: "submitted", httpStatus: response.status, requestId }
        : { result: "ambiguous", httpStatus: response.status };
    }
    if (DEFINITE_REJECTIONS.has(response.status))
      return { result: "rejected", httpStatus: response.status, errorStatus: googleErrorStatus(payload) };

    return { result: "ambiguous", httpStatus: response.status };
  }
}
