import { z } from "zod";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

const HTTP_TIMEOUT_MS = 5000;

export const DeliverWebhookPayloadSchema = z.object({
  deliveryId: z.uuid(),
  url: z.url(),
  companyId: z.uuid(),
  requestBody: z.record(z.string(), z.unknown()),
});
export type DeliverWebhookPayload = z.infer<typeof DeliverWebhookPayloadSchema>;

export abstract class DeliverWebhookRepo {
  abstract getSecret(args: { companyId: string; url: string }): Promise<string | null>;
  abstract markSuccess(args: { id: string; statusCode: number | null; responseMessage: string | null }): Promise<void>;
  abstract markFailed(args: { id: string; statusCode: number | null; responseMessage: string | null }): Promise<void>;
}

export type DeliveryOutcome = {
  status: "success" | "failed";
  statusCode: number | null;
  responseMessage: string | null;
};

@SystemInteractor
export class DeliverWebhookInteractor {
  constructor(private readonly repo: DeliverWebhookRepo) {}

  @Enforce(DeliverWebhookPayloadSchema)
  async invoke(payload: DeliverWebhookPayload): Promise<DeliveryOutcome> {
    const secret = await this.repo.getSecret({ companyId: payload.companyId, url: payload.url });
    const result = await this.postWebhook({ url: payload.url, secret, requestBody: payload.requestBody });

    if (result.success) {
      await this.repo.markSuccess({
        id: payload.deliveryId,
        statusCode: result.statusCode,
        responseMessage: result.responseMessage,
      });
      return { status: "success", statusCode: result.statusCode, responseMessage: result.responseMessage };
    }

    await this.repo.markFailed({
      id: payload.deliveryId,
      statusCode: result.statusCode,
      responseMessage: result.responseMessage,
    });
    return { status: "failed", statusCode: result.statusCode, responseMessage: result.responseMessage };
  }

  private async postWebhook(args: { url: string; secret: string | null; requestBody: unknown }): Promise<{
    success: boolean;
    statusCode: number | null;
    responseMessage: string | null;
  }> {
    const body = JSON.stringify(args.requestBody);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
      const signature = args.secret ? await this.signWebhookPayload(args.secret, body) : null;

      const response = await fetch(args.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(signature && { "X-Webhook-Signature": signature }),
        },
        body,
      });

      return { success: response.ok, statusCode: response.status, responseMessage: response.statusText };
    } catch (error) {
      const responseMessage =
        error instanceof Error && error.name === "AbortError"
          ? `Request timed out after ${HTTP_TIMEOUT_MS}ms`
          : error instanceof Error
            ? error.message
            : "Network error";
      return { success: false, statusCode: null, responseMessage };
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
