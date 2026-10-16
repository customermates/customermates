import type { ProviderFileResult } from "../address-lookup-request";

import { requestProviderFile } from "../address-lookup-request";

export const POSTAL_CODE_USER_AGENT = "Customermates/1.0 (+https://customermates.com/docs/self-hosting; postal codes)";

const CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "binary/octet-stream",
]);

export function downloadPostalCodeFile(url: URL): Promise<ProviderFileResult> {
  return requestProviderFile(url, {
    timeoutMs: 60_000,
    maxBytes: 32 * 1024 * 1024,
    userAgent: POSTAL_CODE_USER_AGENT,
    contentTypes: CONTENT_TYPES,
  });
}
