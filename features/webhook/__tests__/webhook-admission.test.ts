import { describe, expect, it, vi } from "vitest";

import { WebhookAdmission } from "../webhook-admission";

const COMPANY = "00000000-0000-4000-8000-000000000011";
const WEBHOOK = "66666666-6666-4666-8666-666666666666";
const RULE = "00000000-0000-4000-8000-0000000000a1";

function event(kind: string, payload: unknown) {
  return { id: "e1", companyId: COMPANY, kind, subjectKind: kind.split(".")[0], subjectId: RULE, payload };
}

function setup(plan = true) {
  const webhook = { id: WEBHOOK, url: "https://example.invalid/hook" };
  const webhooks = { findEventWebhooksUnscoped: vi.fn().mockResolvedValue([webhook]) };
  const deliveries = {
    admitDeliveryOrThrowUnscoped: vi.fn().mockResolvedValue({ id: "d1", nextAttemptAt: new Date() }),
  };
  const background = { dispatch: vi.fn().mockResolvedValue(undefined) };
  const admission = new WebhookAdmission({} as never, background, webhooks as never, deliveries, {
    deliversWebhooks: () => Promise.resolve(plan),
  });
  return { admission, webhooks, deliveries, background };
}

const fired = {
  webhookId: WEBHOOK,
  ruleId: RULE,
  ruleName: "Follow up",
  runId: "11111111-1111-4111-8111-111111111111",
  trigger: "recordCreated",
  firedAt: "2026-11-12T08:00:00.000Z",
  record: null,
};

describe("admitting events that are not record events", () => {
  it("queues a delivery of a rule event for the webhook the rule names", async () => {
    const { admission, webhooks, deliveries, background } = setup();
    const logged = event("automation.rule.fired", fired);
    await admission.admit(logged as never);
    expect(webhooks.findEventWebhooksUnscoped).toHaveBeenCalledWith(logged, [WEBHOOK]);
    expect(deliveries.admitDeliveryOrThrowUnscoped).toHaveBeenCalledWith({
      event: logged,
      webhook: { id: WEBHOOK, url: "https://example.invalid/hook" },
      subscriptionRevision: null,
    });
    expect(background.dispatch).toHaveBeenCalledWith("deliver-webhook", { deliveryId: "d1", companyId: COMPANY });
  });

  it("reaches no webhook when a rule event does not name one", async () => {
    const { admission, webhooks } = setup();
    const logged = event("automation.rule.fired", { ...fired, webhookId: "not-an-id" });
    await admission.admit(logged as never);
    expect(webhooks.findEventWebhooksUnscoped).toHaveBeenCalledWith(logged, []);
  });

  it("offers every other event to every webhook that subscribed to it", async () => {
    const { admission, webhooks } = setup();
    const logged = event("messaging.email.received", { connectedAccountId: "acct" });
    await admission.admit(logged as never);
    expect(webhooks.findEventWebhooksUnscoped).toHaveBeenCalledWith(logged, undefined);
  });

  it("delivers nothing while the plan has no webhooks", async () => {
    const { admission, webhooks, deliveries } = setup(false);
    await admission.admit(event("automation.rule.fired", fired) as never);
    expect(webhooks.findEventWebhooksUnscoped).not.toHaveBeenCalled();
    expect(deliveries.admitDeliveryOrThrowUnscoped).not.toHaveBeenCalled();
  });
});
