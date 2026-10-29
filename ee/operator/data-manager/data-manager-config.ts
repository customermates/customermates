import type { ConversionEventType } from "@/generated/prisma";

export type DataManagerCredentials = { clientId: string; clientSecret: string; refreshToken: string };

export type DataManagerUploadSettings = {
  operatingAccountId: string;
  loginAccountId: string | null;
  conversionActionIds: Record<ConversionEventType, string>;
  credentials: DataManagerCredentials;
  validateOnly: boolean;
};

export type DataManagerUploadConfig =
  | { state: "disabled" }
  | { state: "incomplete"; missing: string[] }
  | { state: "ready"; settings: DataManagerUploadSettings };

export type DataManagerEnvironment = {
  GOOGLE_ADS_CONVERSION_UPLOAD_ENABLED: boolean;
  GOOGLE_ADS_CONVERSION_UPLOAD_INGEST: boolean;
  GOOGLE_ADS_OPERATING_ACCOUNT_ID?: string;
  GOOGLE_ADS_LOGIN_ACCOUNT_ID?: string;
  GOOGLE_ADS_SIGNUP_CONVERSION_ACTION_ID?: string;
  GOOGLE_ADS_PAID_CONVERSION_ACTION_ID?: string;
  GOOGLE_DATA_MANAGER_CLIENT_ID?: string;
  GOOGLE_DATA_MANAGER_CLIENT_SECRET?: string;
  GOOGLE_DATA_MANAGER_REFRESH_TOKEN?: string;
};

const NUMERIC_ID = /^\d{1,20}$/u;

function numericId(value: string | undefined): string | null {
  const normalized = value?.trim().replaceAll("-", "");
  return normalized && NUMERIC_ID.test(normalized) ? normalized : null;
}

function secretValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveDataManagerUploadConfig(source: DataManagerEnvironment): DataManagerUploadConfig {
  if (!source.GOOGLE_ADS_CONVERSION_UPLOAD_ENABLED) return { state: "disabled" };

  const operatingAccountId = numericId(source.GOOGLE_ADS_OPERATING_ACCOUNT_ID);
  const signupActionId = numericId(source.GOOGLE_ADS_SIGNUP_CONVERSION_ACTION_ID);
  const paidActionId = numericId(source.GOOGLE_ADS_PAID_CONVERSION_ACTION_ID);
  const clientId = secretValue(source.GOOGLE_DATA_MANAGER_CLIENT_ID);
  const clientSecret = secretValue(source.GOOGLE_DATA_MANAGER_CLIENT_SECRET);
  const refreshToken = secretValue(source.GOOGLE_DATA_MANAGER_REFRESH_TOKEN);
  const loginAccountConfigured = Boolean(source.GOOGLE_ADS_LOGIN_ACCOUNT_ID?.trim());
  const loginAccountId = numericId(source.GOOGLE_ADS_LOGIN_ACCOUNT_ID);

  const missing = [
    operatingAccountId ? null : "GOOGLE_ADS_OPERATING_ACCOUNT_ID",
    loginAccountConfigured && !loginAccountId ? "GOOGLE_ADS_LOGIN_ACCOUNT_ID" : null,
    signupActionId ? null : "GOOGLE_ADS_SIGNUP_CONVERSION_ACTION_ID",
    paidActionId ? null : "GOOGLE_ADS_PAID_CONVERSION_ACTION_ID",
    clientId ? null : "GOOGLE_DATA_MANAGER_CLIENT_ID",
    clientSecret ? null : "GOOGLE_DATA_MANAGER_CLIENT_SECRET",
    refreshToken ? null : "GOOGLE_DATA_MANAGER_REFRESH_TOKEN",
  ].filter((name): name is string => name !== null);

  if (
    missing.length > 0 ||
    !operatingAccountId ||
    !signupActionId ||
    !paidActionId ||
    !clientId ||
    !clientSecret ||
    !refreshToken
  )
    return { state: "incomplete", missing };

  return {
    state: "ready",
    settings: {
      operatingAccountId,
      loginAccountId,
      conversionActionIds: { signup: signupActionId, paid: paidActionId },
      credentials: { clientId, clientSecret, refreshToken },
      validateOnly: !source.GOOGLE_ADS_CONVERSION_UPLOAD_INGEST,
    },
  };
}
