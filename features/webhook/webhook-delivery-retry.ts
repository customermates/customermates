const RETRYABLE_4XX = new Set([408, 425, 429]);

export function isNonRetryableWebhookStatus(code: number | null): code is number {
  return code !== null && code >= 300 && code < 500 && !RETRYABLE_4XX.has(code);
}
