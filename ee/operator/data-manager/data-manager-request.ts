import type { DataManagerUploadSettings } from "./data-manager-config";
import type { ReportableAdConversion } from "../ad-conversion-reporting";
import type { ConversionEventType } from "@/generated/prisma";

export const DATA_MANAGER_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const DATA_MANAGER_INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest";
export const DATA_MANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager";
export const DATA_MANAGER_MAX_EVENTS_PER_REQUEST = 2000;
export const DATA_MANAGER_DESTINATION = "google_ads:data_manager";

type ProductAccount = { accountType: "GOOGLE_ADS"; accountId: string };
type ConsentStatus = "CONSENT_GRANTED" | "CONSENT_DENIED";
type Consent = { adUserData: ConsentStatus; adPersonalization: ConsentStatus };

export type DataManagerDestination = {
  reference: ConversionEventType;
  operatingAccount: ProductAccount;
  loginAccount?: ProductAccount;
  productDestinationId: string;
};

export type DataManagerEvent = {
  destinationReferences: [ConversionEventType];
  transactionId: string;
  eventTimestamp: string;
  eventSource: "WEB";
  adIdentifiers: { gclid: string };
  consent: Consent;
};

export type DataManagerIngestBody = {
  destinations: DataManagerDestination[];
  events: DataManagerEvent[];
  consent: Consent;
  validateOnly: boolean;
};

export type DataManagerIngestRequest = { body: DataManagerIngestBody; rows: ReportableAdConversion[] };

const CONSENT: Consent = { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_DENIED" };

export function isDataManagerUploadable(row: ReportableAdConversion): boolean {
  return (
    row.provider === "google_ads" &&
    row.identifierKind === "gclid" &&
    row.consentedAt.getTime() <= row.conversionAt.getTime()
  );
}

function destination(type: ConversionEventType, settings: DataManagerUploadSettings): DataManagerDestination {
  return {
    reference: type,
    operatingAccount: { accountType: "GOOGLE_ADS", accountId: settings.operatingAccountId },
    ...(settings.loginAccountId
      ? { loginAccount: { accountType: "GOOGLE_ADS" as const, accountId: settings.loginAccountId } }
      : {}),
    productDestinationId: settings.conversionActionIds[type],
  };
}

function event(row: ReportableAdConversion): DataManagerEvent {
  return {
    destinationReferences: [row.conversionType],
    transactionId: row.orderId,
    eventTimestamp: row.conversionAt.toISOString(),
    eventSource: "WEB",
    adIdentifiers: { gclid: row.identifierValue },
    consent: CONSENT,
  };
}

export function buildDataManagerIngestRequests(
  rows: readonly ReportableAdConversion[],
  settings: DataManagerUploadSettings,
): DataManagerIngestRequest[] {
  const uploadable = rows.filter(isDataManagerUploadable);
  const requests: DataManagerIngestRequest[] = [];

  for (let start = 0; start < uploadable.length; start += DATA_MANAGER_MAX_EVENTS_PER_REQUEST) {
    const chunk = uploadable.slice(start, start + DATA_MANAGER_MAX_EVENTS_PER_REQUEST);
    const types = [...new Set(chunk.map((row) => row.conversionType))].sort();
    requests.push({
      rows: chunk,
      body: {
        destinations: types.map((type) => destination(type, settings)),
        events: chunk.map(event),
        consent: CONSENT,
        validateOnly: settings.validateOnly,
      },
    });
  }

  return requests;
}
