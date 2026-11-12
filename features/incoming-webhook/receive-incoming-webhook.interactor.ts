import type { TokenBucketRateLimiter } from "@/core/network/token-bucket-rate-limiter";
import type { EventService } from "@/features/event/event.service";
import type { PlanLimitsService } from "@/ee/subscription/plan-limits.service";
import type { IncomingWebhookEngine } from "./incoming-webhook-engine";
import type { IncomingWebhookLookup, IncomingWebhookLookupRepo } from "./incoming-webhook-lookup.repo";
import type { IncomingWebhookTenant } from "./incoming-webhook-tenant";
import type { IncomingWebhookRepo } from "./incoming-webhook.repo";
import type { IncomingWebhookOutcome, IncomingWebhookReceiveResult } from "./incoming-webhook.schema";

import { randomUUID } from "node:crypto";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import * as ErrorReporter from "@/core/observability/server";
import { DomainEvent } from "@/features/event/domain-events";
import { eventVia } from "@/features/event/event-via";

import { parseIncomingMapping } from "./incoming-webhook-dto";
import { incomingWebhookSignatureValid } from "./incoming-webhook-signature";
import { incomingWebhookIdFromToken, incomingWebhookTokenValid } from "./incoming-webhook-token";
import { INCOMING_WEBHOOK_LIMITS } from "./incoming-webhook.schema";

export type IncomingWebhookRequest = {
  token: string;
  body: string;
  header: (name: string) => string | null;
  visitor?: string | null;
};

export type IncomingWebhookLimiters = { webhook: TokenBucketRateLimiter; visitor: TokenBucketRateLimiter };

type Settings = { authSecret: string | undefined };

type Parsed = { ok: true; value: unknown } | { ok: false };

const NOT_FOUND: IncomingWebhookReceiveResult = { status: 404, body: { ok: false, error: "not_found" } };

function parseBody(body: string): Parsed {
  try {
    const value: unknown = JSON.parse(body);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

@SystemInteractor
export class ReceiveIncomingWebhookInteractor {
  constructor(
    private lookup: IncomingWebhookLookupRepo,
    private repo: IncomingWebhookRepo,
    private tenant: IncomingWebhookTenant,
    private engine: IncomingWebhookEngine,
    private events: Pick<EventService, "publish">,
    private plans: Pick<PlanLimitsService, "deliversWebhooks">,
    private limiters: IncomingWebhookLimiters,
    private settings: Settings,
  ) {}

  async invoke(request: IncomingWebhookRequest): Promise<IncomingWebhookReceiveResult> {
    const id = incomingWebhookIdFromToken(request.token);
    if (!id) return NOT_FOUND;
    const blocked = this.admit(id, request.visitor);
    if (blocked) return blocked;

    const webhook = await this.lookup.findWebhookUnscoped(id);
    if (
      !webhook ||
      !webhook.enabled ||
      webhook.company.deletingAt ||
      !incomingWebhookTokenValid(request.token, id, webhook.tokenVersion, this.settings.authSecret)
    )
      return NOT_FOUND;

    return this.tenant.run(
      webhook.createdById,
      eventVia("incomingWebhook", webhook.name),
      () => this.process(webhook, request),
      () => Promise.resolve(NOT_FOUND),
    );
  }

  private admit(id: string, visitor: string | null | undefined): IncomingWebhookReceiveResult | null {
    const checks = [
      [this.limiters.visitor, visitor ? `visitor:${visitor}` : null],
      [this.limiters.webhook, `webhook:${id}`],
    ] as const;
    for (const [limiter, key] of checks) {
      if (!key) continue;
      const admission = limiter.admit(key);
      if (!admission.allowed)
        return {
          status: 429,
          body: { ok: false, error: "rate_limited" },
          retryAfterSeconds: admission.retryAfterSeconds,
        };
    }
    return null;
  }

  private async log(
    webhook: IncomingWebhookLookup,
    outcome: IncomingWebhookOutcome,
    statusCode: number,
    message: string | null,
    request: IncomingWebhookRequest,
    payload: unknown,
    recordId: string | null = null,
  ): Promise<string> {
    const bytes = Buffer.byteLength(request.body, "utf8");
    const { id } = await this.repo.recordDelivery(
      {
        webhookId: webhook.id,
        outcome,
        statusCode,
        message,
        recordId,
        payloadBytes: bytes,
        payload: bytes <= INCOMING_WEBHOOK_LIMITS.storedPayloadBytes ? payload : null,
      },
      INCOMING_WEBHOOK_LIMITS.retentionDays,
    );
    return id;
  }

  private async rejected(
    webhook: IncomingWebhookLookup,
    outcome: IncomingWebhookOutcome,
    status: number,
    error: string,
    request: IncomingWebhookRequest,
    payload: unknown = null,
  ): Promise<IncomingWebhookReceiveResult> {
    await this.log(webhook, outcome, status, error, request, payload);
    return { status, body: { ok: false, error } };
  }

  private async process(
    webhook: IncomingWebhookLookup,
    request: IncomingWebhookRequest,
  ): Promise<IncomingWebhookReceiveResult> {
    if (!(await this.plans.deliversWebhooks(webhook.companyId)))
      return this.rejected(webhook, "rejected_plan", 403, "plan", request);
    if (Buffer.byteLength(request.body, "utf8") > INCOMING_WEBHOOK_LIMITS.maxBodyBytes)
      return this.rejected(webhook, "rejected_limit", 413, "payload_too_large", request);
    if (webhook.signingSecret) {
      const header = request.header(webhook.signatureHeader);
      if (!incomingWebhookSignatureValid(webhook.signingSecret, request.body, header))
        return this.rejected(webhook, "rejected_signature", 401, "signature", request);
    }
    const parsed = parseBody(request.body);
    const mapping = parseIncomingMapping(webhook.mapping);
    if (!parsed.ok || !mapping) return this.rejected(webhook, "rejected_payload", 400, "payload_invalid", request);

    const plan = await this.engine.plan({ typeId: webhook.typeId, mapping }, parsed.value);
    if (!plan.ok && plan.reason === "unavailable") return this.rejected(webhook, "failed", 404, "list", request);
    if (!plan.ok) {
      const bad = plan.values.filter((value) => value.error).map((value) => `${value.path}:${value.error}`);
      await this.log(webhook, "rejected_payload", 422, bad.join(", ").slice(0, 500), request, parsed.value);
      return { status: 422, body: { ok: false, error: "payload_invalid" } };
    }

    const sent = request.header("idempotency-key")?.trim();
    const key = sent && sent.length >= 8 ? `webhook:${webhook.id}:${sent.slice(0, 100)}` : `webhook:${randomUUID()}`;
    const applied = await this.engine.apply(plan, key);
    if (!applied.ok) return this.failed(webhook, applied, request, parsed.value);

    const outcome = applied.operation === "update" ? "updated" : "created";
    const deliveryId = await this.log(
      webhook,
      outcome,
      outcome === "created" ? 201 : 200,
      null,
      request,
      parsed.value,
      applied.recordId,
    );
    await this.events
      .publish(
        DomainEvent.WEBHOOK_RECEIVED,
        {
          entityId: deliveryId,
          payload: {
            webhookId: webhook.id,
            webhookName: webhook.name,
            typeId: webhook.typeId,
            deliveryId,
            outcome,
            recordId: applied.recordId,
          },
        },
        { systemCompanyId: webhook.companyId },
      )
      .catch((error: unknown) => {
        ErrorReporter.captureException(error, { tags: { kind: "webhook-received-event", companyId: webhook.companyId } });
      });
    return {
      status: outcome === "created" ? 201 : 200,
      body: { ok: true, outcome, ...(applied.recordId ? { recordId: applied.recordId } : {}) },
    };
  }

  private async failed(
    webhook: IncomingWebhookLookup,
    applied: { reason: "conflict" | "invalid" | "failed"; message: string },
    request: IncomingWebhookRequest,
    payload: unknown,
  ): Promise<IncomingWebhookReceiveResult> {
    const status = applied.reason === "conflict" ? 409 : applied.reason === "invalid" ? 422 : 500;
    const outcome = applied.reason === "failed" ? "failed" : "rejected_payload";
    await this.log(webhook, outcome, status, applied.message, request, payload);
    return { status, body: { ok: false, error: applied.reason === "invalid" ? "payload_invalid" : applied.reason } };
  }
}
