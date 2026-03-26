import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const MAX_CONCURRENCY = 10;
const MAX_JOBS = 500;
const MAX_DURATION_MS = 15_000;
const HTTP_TIMEOUT_MS = 5000;

export type PendingDeliveryRow = {
  id: string;
  url: string;
  companyId: string;
  event: string;
  requestBody: Record<string, unknown>;
};

export abstract class ClaimPendingDeliveriesRepo {
  abstract claimPending(limit: number): Promise<PendingDeliveryRow[]>;
}

export abstract class UpdateDeliveryOutcomeRepo {
  abstract markSuccess(data: { id: string; statusCode: number | null; responseMessage: string | null }): Promise<void>;
  abstract markFailed(data: { id: string; statusCode: number | null; responseMessage: string | null }): Promise<void>;
}

export abstract class GetWebhookSecretRepo {
  abstract getSecret(companyId: string, url: string): Promise<string | null>;
}

@SystemInteractor
export class ProcessWebhookDeliveriesInteractor {
  constructor(
    private readonly claimRepo: ClaimPendingDeliveriesRepo,
    private readonly outcomeRepo: UpdateDeliveryOutcomeRepo,
    private readonly secretRepo: GetWebhookSecretRepo,
  ) {}

  async invoke(): Promise<void> {
    const started = Date.now();

    const claimed = await this.claimRepo.claimPending(MAX_JOBS);
    if (claimed.length === 0) return;

    for (let i = 0; i < claimed.length; i += MAX_CONCURRENCY) {
      if (Date.now() - started > MAX_DURATION_MS) break;
      await Promise.all(claimed.slice(i, i + MAX_CONCURRENCY).map((job) => this.deliverJob(job)));
    }
  }

  private async deliverJob(job: PendingDeliveryRow): Promise<void> {
    try {
      const secret = await this.secretRepo.getSecret(job.companyId, job.url);

      const result = await this.postWebhook({ url: job.url, secret, requestBody: job.requestBody });

      if (result.success) {
        await this.outcomeRepo.markSuccess({ id: job.id, ...result });
        return;
      }

      await this.outcomeRepo.markFailed({ id: job.id, ...result });
    } catch (err) {
      const responseMessage = err instanceof Error ? err.message : "Unknown error";
      await this.outcomeRepo.markFailed({ id: job.id, statusCode: null, responseMessage });
    }
  }

  private async postWebhook(args: { url: string; secret: string | null; requestBody: unknown }): Promise<{
    success: boolean;
    statusCode: number | null;
    responseMessage: string | null;
  }> {
    const body = JSON.stringify(args.requestBody);

    let statusCode: number | null = null;
    let responseMessage: string | null = null;
    let success = false;

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

      success = response.ok;
      statusCode = response.status;
      responseMessage = response.statusText;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        responseMessage = `Request timed out after ${HTTP_TIMEOUT_MS}ms`;
      else responseMessage = error instanceof Error ? error.message : "Network error";
    } finally {
      clearTimeout(timeoutId);
    }

    return { success, statusCode, responseMessage };
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
