import { renderWebhookBody } from "./webhook-body-template";
import { allowsCredentialedHeaders } from "./webhook-headers";
import { isWebhookEndpointUrl } from "./webhook.schema";
import {
  WEBHOOK_DESTINATION_NOT_ALLOWED_MESSAGE,
  allowsPrivateWebhookDestinations,
  resolveWebhookDestination,
} from "./webhook-destination";
import { sendPinnedWebhookRequest } from "./webhook-transport";

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
    if (!isWebhookEndpointUrl(input.url)) return invalid("Webhook endpoints require HTTP or HTTPS without user info");
    if (Object.keys(input.headers).length && !allowsCredentialedHeaders(input.url))
      return invalid("Custom headers require an HTTPS endpoint");
    const rendered = input.bodyTemplate ? renderWebhookBody(input.bodyTemplate, input.requestBody) : null;
    if (rendered && !rendered.ok) return invalid(`Body template could not be rendered (${rendered.reason})`);
    const body = JSON.stringify(rendered ? rendered.body : input.requestBody);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const url = new URL(input.url);
      const destination = await abortable(
        resolveWebhookDestination(url, allowsPrivateWebhookDestinations()),
        controller.signal,
      );
      if (!destination) return invalid(WEBHOOK_DESTINATION_NOT_ALLOWED_MESSAGE);

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
      const response = await sendPinnedWebhookRequest({
        url,
        destination,
        signal: controller.signal,
        headers: {
          Accept: "*/*",
          "User-Agent": "node",
          ...input.headers,
          "Content-Type": "application/json",
          "X-Customermates-Delivery-Id": input.deliveryId,
          ...(signature ? { "X-Webhook-Signature": signature } : {}),
        },
        body,
      });
      return {
        success: response.statusCode >= 200 && response.statusCode < 300,
        statusCode: response.statusCode,
        responseMessage:
          response.statusCode >= 300 && response.statusCode < 400
            ? "Redirect not followed"
            : `HTTP ${response.statusCode}`,
      };
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

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("The operation was aborted", "AbortError"));
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
