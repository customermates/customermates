import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { renderWebhookBody } from "./webhook-body-template";
import { allowsCredentialedHeaders } from "./webhook-headers";
import {
  WEBHOOK_DESTINATION_NOT_ALLOWED_MESSAGE,
  allowsPrivateWebhookDestinations,
  resolveWebhookDestination,
} from "./webhook-destination";
import { sendPinnedWebhookRequest } from "./webhook-transport";

const HTTP_TIMEOUT_MS = 5000;
const UNRESOLVABLE_HOST_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ENODATA"]);

const Schema = z.object({
  deliveryId: z.uuid(),
  url: z.url(),
  companyId: z.uuid(),
  requestBody: z.record(z.string(), z.unknown()),
});
export type DeliverWebhookPayload = z.infer<typeof Schema>;

export const WEBHOOK_PREFLIGHT_FAILURE_STATUS = 422;

export type WebhookDeliveryConfig = {
  secret: string | null;
  headers: Record<string, string>;
  bodyTemplate: string | null;
  ambiguous: boolean;
};

export abstract class DeliverWebhookConfigRepo {
  abstract getDeliveryConfigUnscoped(args: { companyId: string; url: string }): Promise<WebhookDeliveryConfig>;
}

export abstract class DeliverWebhookRepo {
  abstract markSuccessUnscoped(args: {
    id: string;
    companyId: string;
    statusCode: number | null;
    responseMessage: string | null;
  }): Promise<void>;
  abstract markFailedUnscoped(args: {
    id: string;
    companyId: string;
    statusCode: number | null;
    responseMessage: string | null;
  }): Promise<void>;
}

type DeliveryOutcome = {
  status: "success" | "failed";
  statusCode: number | null;
  responseMessage: string | null;
};

@SystemInteractor
export class DeliverWebhookInteractor {
  constructor(
    private readonly repo: DeliverWebhookRepo,
    private readonly webhookRepo: DeliverWebhookConfigRepo,
  ) {}

  @Enforce(Schema)
  async invoke(payload: DeliverWebhookPayload): Promise<DeliveryOutcome> {
    const { secret, headers, bodyTemplate, ambiguous } = await this.webhookRepo.getDeliveryConfigUnscoped({
      companyId: payload.companyId,
      url: payload.url,
    });

    if (ambiguous) {
      const responseMessage = "Several webhooks share this URL, so custom headers and body templates are ambiguous";

      await this.repo.markFailedUnscoped({
        id: payload.deliveryId,
        companyId: payload.companyId,
        statusCode: WEBHOOK_PREFLIGHT_FAILURE_STATUS,
        responseMessage,
      });

      return { status: "failed", statusCode: WEBHOOK_PREFLIGHT_FAILURE_STATUS, responseMessage };
    }

    if (Object.keys(headers).length > 0 && !allowsCredentialedHeaders(payload.url)) {
      const responseMessage = "Custom headers require an HTTPS endpoint";

      await this.repo.markFailedUnscoped({
        id: payload.deliveryId,
        companyId: payload.companyId,
        statusCode: WEBHOOK_PREFLIGHT_FAILURE_STATUS,
        responseMessage,
      });

      return { status: "failed", statusCode: WEBHOOK_PREFLIGHT_FAILURE_STATUS, responseMessage };
    }

    const rendered = bodyTemplate ? renderWebhookBody(bodyTemplate, payload.requestBody) : null;

    if (rendered && !rendered.ok) {
      const responseMessage = `Body template could not be rendered (${rendered.reason})`;

      await this.repo.markFailedUnscoped({
        id: payload.deliveryId,
        companyId: payload.companyId,
        statusCode: WEBHOOK_PREFLIGHT_FAILURE_STATUS,
        responseMessage,
      });

      return { status: "failed", statusCode: WEBHOOK_PREFLIGHT_FAILURE_STATUS, responseMessage };
    }

    const result = await this.postWebhook({
      url: payload.url,
      secret,
      headers,
      requestBody: rendered ? rendered.body : payload.requestBody,
    });

    if (result.success) {
      await this.repo.markSuccessUnscoped({
        id: payload.deliveryId,
        companyId: payload.companyId,
        statusCode: result.statusCode,
        responseMessage: result.responseMessage,
      });
      return { status: "success", statusCode: result.statusCode, responseMessage: result.responseMessage };
    }

    await this.repo.markFailedUnscoped({
      id: payload.deliveryId,
      companyId: payload.companyId,
      statusCode: result.statusCode,
      responseMessage: result.responseMessage,
    });

    return { status: "failed", statusCode: result.statusCode, responseMessage: result.responseMessage };
  }

  private async postWebhook(args: {
    url: string;
    secret: string | null;
    headers: Record<string, string>;
    requestBody: unknown;
  }): Promise<{
    success: boolean;
    statusCode: number | null;
    responseMessage: string | null;
  }> {
    const body = JSON.stringify(args.requestBody);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const url = new URL(args.url);
      const destination = await abortable(
        resolveWebhookDestination(url, allowsPrivateWebhookDestinations()),
        controller.signal,
      );

      if (!destination) {
        return {
          success: false,
          statusCode: WEBHOOK_PREFLIGHT_FAILURE_STATUS,
          responseMessage: WEBHOOK_DESTINATION_NOT_ALLOWED_MESSAGE,
        };
      }

      const signature = args.secret ? await this.signWebhookPayload(args.secret, body) : null;

      const response = await sendPinnedWebhookRequest({
        url,
        destination,
        signal: controller.signal,
        headers: {
          Accept: "*/*",
          "User-Agent": "node",
          ...args.headers,
          "Content-Type": "application/json",
          ...(signature && { "X-Webhook-Signature": signature }),
        },
        body,
      });

      if (response.statusCode >= 300 && response.statusCode < 400)
        return { success: false, statusCode: response.statusCode, responseMessage: "Redirect not followed" };

      return {
        success: response.statusCode >= 200 && response.statusCode < 300,
        statusCode: response.statusCode,
        responseMessage: response.statusMessage,
      };
    } catch (error) {
      return { success: false, statusCode: null, responseMessage: describeNetworkError(error) };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async signWebhookPayload(secret: string, payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);

    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
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

function describeNetworkError(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return `Request timed out after ${HTTP_TIMEOUT_MS}ms`;

  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  if (code && UNRESOLVABLE_HOST_CODES.has(code)) return "Host could not be resolved";

  return "Network error";
}
