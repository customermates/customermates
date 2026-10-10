import { renderWebhookBody } from "./webhook-body-template";
import { allowsCredentialedHeaders } from "./webhook-headers";

export type WebhookTransportResult = { success: boolean; statusCode: number | null; responseMessage: string };
export const WEBHOOK_PREFLIGHT_FAILURE_STATUS = 422;
const HTTP_TIMEOUT_MS = 5000;

export class WebhookTransport {
  async post(input: {
    deliveryId: string;
    url: string;
    secret: string | null;
    headers: Record<string, string>;
    bodyTemplate: string | null;
    requestBody: Record<string, unknown>;
  }): Promise<WebhookTransportResult> {
    const invalid = (responseMessage: string): WebhookTransportResult => ({
      success: false,
      statusCode: WEBHOOK_PREFLIGHT_FAILURE_STATUS,
      responseMessage,
    });
    try {
      if (!["http:", "https:"].includes(new URL(input.url).protocol))
        return invalid("Webhook endpoints require HTTP or HTTPS");
    } catch {
      return invalid("Invalid webhook endpoint");
    }
    if (Object.keys(input.headers).length && !allowsCredentialedHeaders(input.url))
      return invalid("Custom headers require an HTTPS endpoint");
    const rendered = input.bodyTemplate ? renderWebhookBody(input.bodyTemplate, input.requestBody) : null;
    if (rendered && !rendered.ok) return invalid(`Body template could not be rendered (${rendered.reason})`);
    const body = JSON.stringify(rendered ? rendered.body : input.requestBody);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      let signature: string | null = null;
      if (input.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw",
          encoder.encode(input.secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body))))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }
      const response = await fetch(input.url, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          ...input.headers,
          "Content-Type": "application/json",
          "X-Customermates-Delivery-Id": input.deliveryId,
          ...(signature ? { "X-Webhook-Signature": signature } : {}),
        },
        body,
      });
      await response.body?.cancel();
      return { success: response.ok, statusCode: response.status, responseMessage: `HTTP ${response.status}` };
    } catch {
      return {
        success: false,
        statusCode: null,
        responseMessage: controller.signal.aborted ? "Webhook request timed out" : "Webhook network error",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
