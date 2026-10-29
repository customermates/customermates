import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/env", () => ({
  get env() {
    return testEnv.value;
  },
}));
vi.mock("@/core/decorators/operator-interactor.decorator", () => ({ OperatorInteractor: () => undefined }));

import type { AdConversionExportRow } from "../get/get-ad-conversion-export.repo";
import type { DataManagerUploadSettings } from "../data-manager/data-manager-config";
import type { DataManagerIngestOutcome } from "../data-manager/data-manager-transport";
import type { AdConversionUploadRepo } from "../upload-ad-conversions.repo";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { adConversionReferenceSecret, reportableAdConversions } from "../ad-conversion-reporting";
import { googleAdsConversionCsv } from "../ad-conversion-csv";
import { resolveDataManagerUploadConfig } from "../data-manager/data-manager-config";
import {
  DATA_MANAGER_INGEST_URL,
  DATA_MANAGER_MAX_EVENTS_PER_REQUEST,
  DATA_MANAGER_TOKEN_URL,
  buildDataManagerIngestRequests,
} from "../data-manager/data-manager-request";
import { GoogleDataManagerTransport } from "../data-manager/google-data-manager-transport";
import { UploadAdConversionsInteractor } from "../upload-ad-conversions.interactor";
import { GetAdConversionExportInteractor } from "../get/get-ad-conversion-export.interactor";

const NOW = new Date("2026-10-29T12:00:00.000Z");
const SECRET = adConversionReferenceSecret("test-secret") as string;

const READY_ENV = {
  BETTER_AUTH_SECRET: "test-secret",
  GOOGLE_ADS_CONVERSION_UPLOAD_ENABLED: true,
  GOOGLE_ADS_CONVERSION_UPLOAD_INGEST: false,
  GOOGLE_ADS_OPERATING_ACCOUNT_ID: "123-456-7890",
  GOOGLE_ADS_SIGNUP_CONVERSION_ACTION_ID: "111",
  GOOGLE_ADS_PAID_CONVERSION_ACTION_ID: "222",
  GOOGLE_DATA_MANAGER_CLIENT_ID: "client-id",
  GOOGLE_DATA_MANAGER_CLIENT_SECRET: "client-secret",
  GOOGLE_DATA_MANAGER_REFRESH_TOKEN: "refresh-token",
};

const SETTINGS: DataManagerUploadSettings = {
  operatingAccountId: "1234567890",
  loginAccountId: null,
  conversionActionIds: { signup: "111", paid: "222" },
  credentials: { clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token" },
  validateOnly: true,
};

function row(overrides: Partial<AdConversionExportRow> = {}): AdConversionExportRow {
  return {
    companyId: "company-1",
    provider: "google_ads",
    identifierKind: "gclid",
    identifierValue: "Case-Sensitive_GCLID",
    clickedAt: new Date("2026-10-20T10:00:00.000Z"),
    consentedAt: new Date("2026-10-20T10:01:00.000Z"),
    consentNoticeVersion: AD_ATTRIBUTION_NOTICE_VERSION,
    conversionType: "signup",
    conversionAt: new Date("2026-10-20T10:30:00.000Z"),
    ...overrides,
  };
}

function ledger(blocking: Array<{ companyId: string; conversionType: "signup" | "paid" }> = []) {
  return {
    listBlockingUploadsUnscoped: vi.fn().mockResolvedValue(blocking),
    startBatchUnscoped: vi.fn().mockResolvedValue(undefined),
    settleBatchUnscoped: vi.fn().mockResolvedValue(undefined),
  } satisfies Record<keyof AdConversionUploadRepo, unknown>;
}

function transport(outcomes: DataManagerIngestOutcome[] = [], token: string | null = "access-token") {
  const queue = [...outcomes];
  return {
    accessToken: vi.fn().mockResolvedValue(token),
    ingest: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(queue.shift() ?? { result: "accepted", httpStatus: 200, requestId: "request-1" }),
      ),
  };
}

function uploader(
  rows: AdConversionExportRow[],
  ledgerRepo = ledger(),
  transportDouble = transport(),
): UploadAdConversionsInteractor {
  return new UploadAdConversionsInteractor(
    { listAdConversionCandidatesUnscoped: () => Promise.resolve(rows) },
    ledgerRepo,
    transportDouble,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  testEnv.value = { ...READY_ENV };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Data Manager upload configuration", () => {
  it("is off unless the flag is set, whatever else is configured", () => {
    expect(
      resolveDataManagerUploadConfig({
        ...READY_ENV,
        GOOGLE_ADS_CONVERSION_UPLOAD_ENABLED: false,
      }),
    ).toEqual({ state: "disabled" });
  });

  it("names every missing or malformed variable and never echoes a value", () => {
    const config = resolveDataManagerUploadConfig({
      GOOGLE_ADS_CONVERSION_UPLOAD_ENABLED: true,
      GOOGLE_ADS_CONVERSION_UPLOAD_INGEST: false,
      GOOGLE_ADS_OPERATING_ACCOUNT_ID: "not-a-number",
      GOOGLE_ADS_LOGIN_ACCOUNT_ID: "abc",
      GOOGLE_DATA_MANAGER_CLIENT_SECRET: "client-secret",
    });
    expect(config).toEqual({
      state: "incomplete",
      missing: [
        "GOOGLE_ADS_OPERATING_ACCOUNT_ID",
        "GOOGLE_ADS_LOGIN_ACCOUNT_ID",
        "GOOGLE_ADS_SIGNUP_CONVERSION_ACTION_ID",
        "GOOGLE_ADS_PAID_CONVERSION_ACTION_ID",
        "GOOGLE_DATA_MANAGER_CLIENT_ID",
        "GOOGLE_DATA_MANAGER_REFRESH_TOKEN",
      ],
    });
    expect(JSON.stringify(config)).not.toContain("client-secret");
  });

  it("validates only unless ingesting is switched on explicitly", () => {
    const validating = resolveDataManagerUploadConfig(READY_ENV);
    const ingesting = resolveDataManagerUploadConfig({ ...READY_ENV, GOOGLE_ADS_CONVERSION_UPLOAD_INGEST: true });
    expect(validating).toMatchObject({
      state: "ready",
      settings: { validateOnly: true, operatingAccountId: "1234567890" },
    });
    expect(ingesting).toMatchObject({ state: "ready", settings: { validateOnly: false } });
  });
});

describe("Data Manager request builder", () => {
  it("builds one events:ingest body with a destination per conversion action and the export's order id", () => {
    const rows = reportableAdConversions(
      [row(), row({ conversionType: "paid", conversionAt: new Date("2026-10-25T08:00:00.000Z") })],
      SECRET,
      NOW,
    );
    const [request, ...rest] = buildDataManagerIngestRequests(rows, { ...SETTINGS, loginAccountId: "9876543210" });

    expect(rest).toEqual([]);
    expect(request.body).toEqual({
      destinations: [
        {
          reference: "paid",
          operatingAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" },
          loginAccount: { accountType: "GOOGLE_ADS", accountId: "9876543210" },
          productDestinationId: "222",
        },
        {
          reference: "signup",
          operatingAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" },
          loginAccount: { accountType: "GOOGLE_ADS", accountId: "9876543210" },
          productDestinationId: "111",
        },
      ],
      events: [
        {
          destinationReferences: ["signup"],
          transactionId: rows[0].orderId,
          eventTimestamp: "2026-10-20T10:30:00.000Z",
          eventSource: "WEB",
          adIdentifiers: { gclid: "Case-Sensitive_GCLID" },
          consent: { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_DENIED" },
        },
        {
          destinationReferences: ["paid"],
          transactionId: rows[1].orderId,
          eventTimestamp: "2026-10-25T08:00:00.000Z",
          eventSource: "WEB",
          adIdentifiers: { gclid: "Case-Sensitive_GCLID" },
          consent: { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_DENIED" },
        },
      ],
      consent: { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_DENIED" },
      validateOnly: true,
    });
    expect(JSON.stringify(request.body)).not.toMatch(/company-1|conversionValue|currency|userData/);
  });

  it("uses the same order id as the CSV export so both routes deduplicate against each other", async () => {
    testEnv.value = { BETTER_AUTH_SECRET: "test-secret" };
    const exported = unwrapValidated(
      new GetAdConversionExportInteractor({
        listAdConversionCandidatesUnscoped: () => Promise.resolve([row()]),
      }).invoke(),
    );
    const [request] = buildDataManagerIngestRequests(reportableAdConversions([row()], SECRET, NOW), SETTINGS);
    expect(googleAdsConversionCsv(await exported)).toContain(`,${request.body.events[0].transactionId},`);
  });

  it("keeps only consented gclid conversions inside the deadline and under the current notice", () => {
    const rows = reportableAdConversions(
      [
        row({ companyId: "kept" }),
        row({ companyId: "gbraid", identifierKind: "gbraid" }),
        row({ companyId: "other-provider", provider: "openai_ads", identifierKind: "oppref" }),
        row({ companyId: "old-notice", consentNoticeVersion: "2020-01-01" }),
        row({
          companyId: "past-deadline",
          clickedAt: new Date("2026-07-01T10:00:00.000Z"),
          consentedAt: new Date("2026-07-01T10:01:00.000Z"),
          conversionAt: new Date("2026-07-02T10:00:00.000Z"),
        }),
        row({ companyId: "consent-after-conversion", consentedAt: new Date("2026-10-21T00:00:00.000Z") }),
      ],
      SECRET,
      NOW,
    );
    const requests = buildDataManagerIngestRequests(rows, SETTINGS);
    expect(requests.flatMap((request) => request.rows.map((entry) => entry.companyId))).toEqual(["kept"]);
  });

  it("splits at Google's limit of 2000 events per request", () => {
    const rows = reportableAdConversions(
      Array.from({ length: DATA_MANAGER_MAX_EVENTS_PER_REQUEST + 1 }, (_, index) => row({ companyId: `c-${index}` })),
      SECRET,
      NOW,
    );
    const requests = buildDataManagerIngestRequests(rows, SETTINGS);
    expect(requests.map((request) => request.body.events.length)).toEqual([2000, 1]);
    expect(requests.map((request) => request.body.destinations.map((entry) => entry.reference))).toEqual([
      ["signup"],
      ["signup"],
    ]);
  });
});

describe("Google Data Manager transport", () => {
  it("exchanges the refresh token for the datamanager scope and posts the body to events:ingest", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { access_token: "access-token" }))
      .mockResolvedValueOnce(jsonResponse(200, { requestId: "request-42" }));
    const client = new GoogleDataManagerTransport(fetchImpl);
    const [request] = buildDataManagerIngestRequests(reportableAdConversions([row()], SECRET, NOW), SETTINGS);

    await expect(client.accessToken(SETTINGS.credentials)).resolves.toBe("access-token");
    await expect(client.ingest(request.body, "access-token")).resolves.toEqual({
      result: "accepted",
      httpStatus: 200,
      requestId: "request-42",
    });

    const [tokenUrl, tokenInit] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe(DATA_MANAGER_TOKEN_URL);
    expect(Object.fromEntries(new URLSearchParams(tokenInit.body as string))).toEqual({
      grant_type: "refresh_token",
      client_id: "client-id",
      client_secret: "client-secret",
      refresh_token: "refresh-token",
      scope: "https://www.googleapis.com/auth/datamanager",
    });
    const [ingestUrl, ingestInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(ingestUrl).toBe("https://datamanager.googleapis.com/v1/events:ingest");
    expect(ingestUrl).toBe(DATA_MANAGER_INGEST_URL);
    expect(ingestInit.method).toBe("POST");
    expect(ingestInit.headers).toEqual({ authorization: "Bearer access-token", "content-type": "application/json" });
    expect(JSON.parse(ingestInit.body as string)).toEqual(request.body);
  });

  it("returns no token when Google refuses the credentials or cannot be reached", async () => {
    const refused = new GoogleDataManagerTransport(vi.fn().mockResolvedValue(jsonResponse(400, { error: "x" })));
    const unreachable = new GoogleDataManagerTransport(vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(refused.accessToken(SETTINGS.credentials)).resolves.toBeNull();
    await expect(unreachable.accessToken(SETTINGS.credentials)).resolves.toBeNull();
  });

  it.each([
    [jsonResponse(400, { error: { status: "INVALID_ARGUMENT", message: "gclid Case-Sensitive_GCLID" } }), "rejected"],
    [jsonResponse(429, { error: { status: "RESOURCE_EXHAUSTED" } }), "rejected"],
    [jsonResponse(200, {}), "ambiguous"],
    [jsonResponse(500, { error: { status: "INTERNAL" } }), "ambiguous"],
    [jsonResponse(503, {}), "ambiguous"],
    [new Response("not json", { status: 502 }), "ambiguous"],
  ])("classifies an answer without retrying blindly (%#)", async (response, expected) => {
    const client = new GoogleDataManagerTransport(vi.fn().mockResolvedValue(response));
    const outcome = await client.ingest(
      buildDataManagerIngestRequests(reportableAdConversions([row()], SECRET, NOW), SETTINGS)[0].body,
      "token",
    );
    expect(outcome.result).toBe(expected);
    expect(JSON.stringify(outcome)).not.toContain("Case-Sensitive_GCLID");
  });

  it("treats a lost connection after sending as ambiguous", async () => {
    const client = new GoogleDataManagerTransport(
      vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
    );
    const body = buildDataManagerIngestRequests(reportableAdConversions([row()], SECRET, NOW), SETTINGS)[0].body;
    await expect(client.ingest(body, "token")).resolves.toEqual({ result: "ambiguous", httpStatus: null });
  });
});

describe("upload ad conversions interactor", () => {
  it("refuses without the flag and touches neither the database nor Google", async () => {
    testEnv.value = { ...READY_ENV, GOOGLE_ADS_CONVERSION_UPLOAD_ENABLED: false };
    const ledgerRepo = ledger();
    const transportDouble = transport();
    const candidates = vi.fn();
    const interactor = new UploadAdConversionsInteractor(
      { listAdConversionCandidatesUnscoped: candidates },
      ledgerRepo,
      transportDouble,
    );

    await expect(unwrapValidated(interactor.invoke())).resolves.toMatchObject({ status: "disabled", batches: [] });
    expect(candidates).not.toHaveBeenCalled();
    expect(transportDouble.accessToken).not.toHaveBeenCalled();
    expect(transportDouble.ingest).not.toHaveBeenCalled();
    expect(ledgerRepo.startBatchUnscoped).not.toHaveBeenCalled();
  });

  it("refuses without credentials and lists what is missing", async () => {
    testEnv.value = { ...READY_ENV, GOOGLE_DATA_MANAGER_REFRESH_TOKEN: "" };
    const transportDouble = transport();
    const ledgerRepo = ledger();

    await expect(unwrapValidated(uploader([row()], ledgerRepo, transportDouble).invoke())).resolves.toMatchObject({
      status: "incomplete",
      missing: ["GOOGLE_DATA_MANAGER_REFRESH_TOKEN"],
    });
    expect(transportDouble.accessToken).not.toHaveBeenCalled();
    expect(transportDouble.ingest).not.toHaveBeenCalled();
    expect(ledgerRepo.listBlockingUploadsUnscoped).not.toHaveBeenCalled();
  });

  it("sends validate-only by default and records the batch before and after sending", async () => {
    const ledgerRepo = ledger();
    const transportDouble = transport();

    const outcome = await unwrapValidated(uploader([row()], ledgerRepo, transportDouble).invoke());

    expect(outcome).toEqual({
      status: "sent",
      mode: "validate",
      missing: [],
      eligibleCount: 1,
      alreadyReportedCount: 0,
      batches: [{ rowCount: 1, result: "accepted" }],
    });
    expect(transportDouble.ingest.mock.calls[0][0]).toMatchObject({ validateOnly: true });
    expect(ledgerRepo.startBatchUnscoped).toHaveBeenCalledWith({
      batchId: expect.any(String),
      provider: "google_ads",
      destination: "google_ads:data_manager",
      mode: "validate",
      attemptedAt: NOW,
      rows: [{ companyId: "company-1", conversionType: "signup", orderId: expect.stringMatching(/^[0-9a-f]{32}$/) }],
    });
    const [batchId] = ledgerRepo.startBatchUnscoped.mock.calls[0].map((batch) => batch.batchId);
    expect(ledgerRepo.settleBatchUnscoped).toHaveBeenCalledWith(batchId, ["company-1"], {
      status: "accepted",
      httpStatus: 200,
      errorStatus: null,
      requestId: "request-1",
      settledAt: NOW,
    });
    expect(ledgerRepo.startBatchUnscoped.mock.invocationCallOrder[0]).toBeLessThan(
      transportDouble.ingest.mock.invocationCallOrder[0],
    );
    expect(transportDouble.ingest.mock.invocationCallOrder[0]).toBeLessThan(
      ledgerRepo.settleBatchUnscoped.mock.invocationCallOrder[0],
    );
  });

  it("ingests only when switched on and skips conversions the ledger already holds", async () => {
    testEnv.value = { ...READY_ENV, GOOGLE_ADS_CONVERSION_UPLOAD_INGEST: true };
    const ledgerRepo = ledger([{ companyId: "company-1", conversionType: "signup" }]);
    const transportDouble = transport();

    const outcome = await unwrapValidated(
      uploader(
        [row(), row({ conversionType: "paid", conversionAt: new Date("2026-10-25T08:00:00.000Z") })],
        ledgerRepo,
        transportDouble,
      ).invoke(),
    );

    expect(outcome).toMatchObject({ status: "sent", mode: "ingest", eligibleCount: 2, alreadyReportedCount: 1 });
    expect(ledgerRepo.listBlockingUploadsUnscoped).toHaveBeenCalledWith("google_ads");
    const body = transportDouble.ingest.mock.calls[0][0];
    expect(body.validateOnly).toBe(false);
    expect(body.events.map((entry: { destinationReferences: string[] }) => entry.destinationReferences)).toEqual([
      ["paid"],
    ]);
  });

  it("sends nothing when every conversion is already in the ledger", async () => {
    const transportDouble = transport();
    const outcome = await unwrapValidated(
      uploader([row()], ledger([{ companyId: "company-1", conversionType: "signup" }]), transportDouble).invoke(),
    );
    expect(outcome).toMatchObject({ status: "nothingToSend", alreadyReportedCount: 1 });
    expect(transportDouble.accessToken).not.toHaveBeenCalled();
  });

  it("writes no ledger row when Google refuses the credentials", async () => {
    const ledgerRepo = ledger();
    const transportDouble = transport([], null);
    await expect(unwrapValidated(uploader([row()], ledgerRepo, transportDouble).invoke())).resolves.toMatchObject({
      status: "authorizationFailed",
    });
    expect(transportDouble.ingest).not.toHaveBeenCalled();
    expect(ledgerRepo.startBatchUnscoped).not.toHaveBeenCalled();
  });

  it("stops after an ambiguous answer and records it so the batch is never resent blindly", async () => {
    testEnv.value = { ...READY_ENV, GOOGLE_ADS_CONVERSION_UPLOAD_INGEST: true };
    const ledgerRepo = ledger();
    const transportDouble = transport([{ result: "ambiguous", httpStatus: 503 }]);
    const rows = Array.from({ length: DATA_MANAGER_MAX_EVENTS_PER_REQUEST + 1 }, (_, index) =>
      row({ companyId: `c-${index}` }),
    );

    const outcome = await unwrapValidated(uploader(rows, ledgerRepo, transportDouble).invoke());

    expect(outcome.batches).toEqual([{ rowCount: 2000, result: "ambiguous" }]);
    expect(transportDouble.ingest).toHaveBeenCalledTimes(1);
    expect(ledgerRepo.settleBatchUnscoped.mock.calls[0][2]).toEqual({
      status: "ambiguous",
      httpStatus: 503,
      errorStatus: null,
      requestId: null,
      settledAt: NOW,
    });
  });

  it("records a definite rejection with Google's status code only", async () => {
    const ledgerRepo = ledger();
    const transportDouble = transport([{ result: "rejected", httpStatus: 400, errorStatus: "INVALID_ARGUMENT" }]);

    const outcome = await unwrapValidated(uploader([row()], ledgerRepo, transportDouble).invoke());

    expect(outcome.batches).toEqual([{ rowCount: 1, result: "rejected" }]);
    expect(ledgerRepo.settleBatchUnscoped.mock.calls[0][2]).toMatchObject({
      status: "rejected",
      httpStatus: 400,
      errorStatus: "INVALID_ARGUMENT",
    });
  });
});
