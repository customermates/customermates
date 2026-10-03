import { createHmac, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const deliveryEnv = vi.hoisted(() => ({
  APP_MODE: "cloud",
  DATABASE_URL: process.env.DATABASE_URL,
  NODE_ENV: "test",
}));

vi.mock("@/env", () => ({ env: deliveryEnv }));

const { prisma } = await import("@/prisma/db");
const { DeliverWebhookInteractor } = await import("../deliver-webhook.interactor");
const { createTestRecordRecipientReader } = await import("@/tests/helpers/record-delivery");
const { PrismaWebhookDeliveryQueueRepo } = await import("../prisma-webhook-delivery-queue.repository");
const { WebhookTransport } = await import("../webhook-transport.service");

const deliverWebhook = new DeliverWebhookInteractor(
  new PrismaWebhookDeliveryQueueRepo(),
  createTestRecordRecipientReader(),
  new WebhookTransport(),
);

type CapturedRequest = { headers: Record<string, string | string[] | undefined>; rawBody: string };

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const companyIds: string[] = [];
let server: Server;
let baseUrl: string;
let captured: CapturedRequest[] = [];
let transientFailures = 0;

const SECRET = "delivery-test-secret";

const ENVELOPE = {
  event: "contact.created",
  data: {
    userId: "00000000-0000-4000-8000-00000000aaaa",
    companyId: "00000000-0000-4000-8000-00000000bbbb",
    entityId: "00000000-0000-4000-8000-00000000cccc",
    payload: { id: "00000000-0000-4000-8000-00000000cccc", firstName: 'Ada "The Countess"', lastName: "Lovelace" },
  },
  timestamp: "2026-01-01T00:00:00.000Z",
};

function signature(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

async function seedWebhook(args: {
  path: string;
  headers?: Record<string, string> | null;
  bodyTemplate?: string | null;
  secret?: string | null;
}) {
  const companyId = randomUUID();
  const deliveryId = randomUUID();
  const url = `${baseUrl}${args.path}`;

  companyIds.push(companyId);

  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    const webhook = await prisma.webhook.create({
      data: {
        companyId,
        url,
        events: ["contact.created"],
        secret: args.secret === undefined ? SECRET : args.secret,
        headers: args.headers ?? undefined,
        bodyTemplate: args.bodyTemplate ?? null,
        enabled: true,
      },
    });
    await prisma.webhookDelivery.create({
      data: { id: deliveryId, companyId, webhookId: webhook.id, url, event: "contact.created", requestBody: ENVELOPE },
    });
  });

  return { companyId, deliveryId, url };
}

function deliver(args: { deliveryId: string; url: string; companyId: string }) {
  return runWithoutTenant(() => deliverWebhook.invoke({ ...args, requestBody: ENVELOPE as Record<string, unknown> }));
}

describeDatabase("outbound webhook custom headers and body template", () => {
  beforeAll(async () => {
    server = createServer((request, response) => {
      let raw = "";
      request.on("data", (chunk) => {
        raw += chunk;
      });
      request.on("end", () => {
        captured.push({ headers: request.headers, rawBody: raw });
        if (request.url === "/redirect") {
          response.writeHead(302, { Location: `${baseUrl}/redirect-target` });
          response.end();
          return;
        }
        const status = request.url === "/retry" && transientFailures-- > 0 ? 503 : 200;
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end("{}");
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.webhookDelivery.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.webhook.deleteMany({ where: { companyId: { in: companyIds } } });
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("sends configured custom headers alongside the signature", async () => {
    captured = [];
    const seeded = await seedWebhook({
      path: "/with-headers",
      headers: { Authorization: "Bearer sk-ant-oat01-test", "anthropic-beta": "experimental-cc-routine-2026-04-01" },
    });

    const outcome = await deliver(seeded);

    expect(outcome.status).toBe("success");
    expect(captured).toHaveLength(1);
    expect(captured[0].headers.authorization).toBe("Bearer sk-ant-oat01-test");
    expect(captured[0].headers["anthropic-beta"]).toBe("experimental-cc-routine-2026-04-01");
    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(captured[0].headers["x-webhook-signature"]).toBe(signature(captured[0].rawBody));
  });

  it("renders the body template and signs the rendered body", async () => {
    captured = [];
    const seeded = await seedWebhook({
      path: "/with-template",
      bodyTemplate: '{"text": "{{event}} for {{data.entityId}}"}',
    });

    const outcome = await deliver(seeded);

    expect(outcome.status).toBe("success");
    expect(JSON.parse(captured[0].rawBody)).toEqual({
      text: "contact.created for 00000000-0000-4000-8000-00000000cccc",
    });
    expect(captured[0].headers["x-webhook-signature"]).toBe(signature(captured[0].rawBody));
  });

  it("keeps record content inside the rendered JSON string", async () => {
    captured = [];
    const seeded = await seedWebhook({
      path: "/injection",
      bodyTemplate: '{"text": "{{data.payload.firstName}}"}',
    });

    await deliver(seeded);

    expect(JSON.parse(captured[0].rawBody)).toEqual({ text: 'Ada "The Countess"' });
  });

  it("serialises a nested object placeholder as a JSON string", async () => {
    captured = [];
    const seeded = await seedWebhook({ path: "/payload", bodyTemplate: '{"text": "{{data.payload}}"}' });

    await deliver(seeded);

    const body = JSON.parse(captured[0].rawBody) as { text: string };
    expect(JSON.parse(body.text)).toEqual(ENVELOPE.data.payload);
  });

  it("cannot override Content-Type or the signature header", async () => {
    captured = [];
    const seeded = await seedWebhook({
      path: "/reserved",
      headers: { "Content-Type": "text/plain", "X-Webhook-Signature": "forged", "X-Trace": "kept" },
    });

    await deliver(seeded);

    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(captured[0].headers["x-webhook-signature"]).not.toBe("forged");
    expect(captured[0].headers["x-trace"]).toBe("kept");
  });

  it("fails the delivery without sending when the template cannot render", async () => {
    captured = [];
    const seeded = await seedWebhook({ path: "/broken", bodyTemplate: '{"text": {{event}}}' });

    const outcome = await deliver(seeded);

    expect(outcome.status).toBe("failed");
    expect(outcome.statusCode).toBe(422);
    expect(captured).toHaveLength(0);

    const stored = await runWithoutTenant(() =>
      prisma.webhookDelivery.findUniqueOrThrow({ where: { id: seeded.deliveryId } }),
    );
    expect(stored.status).toBe("failed");
    expect(stored.responseMessage).toContain("invalidJson");
  });

  it("refuses to send custom headers to a cleartext endpoint", async () => {
    captured = [];
    const companyId = randomUUID();
    const deliveryId = randomUUID();
    const url = "http://hooks.example.invalid/cleartext";

    companyIds.push(companyId);

    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.webhook.create({
        data: {
          companyId,
          url,
          events: ["contact.created"],
          secret: SECRET,
          headers: { Authorization: "Bearer leaked-if-sent" },
          enabled: true,
        },
      });
      await prisma.webhookDelivery.create({
        data: { id: deliveryId, companyId, url, event: "contact.created", requestBody: ENVELOPE },
      });
    });

    const outcome = await deliver({ companyId, deliveryId, url });

    expect(outcome.status).toBe("failed");
    expect(outcome.responseMessage).toContain("HTTPS");
    expect(captured).toHaveLength(0);
  });

  it("refuses to guess when two webhooks share the URL and one carries overrides", async () => {
    captured = [];
    const companyId = randomUUID();
    const deliveryId = randomUUID();
    const url = `${baseUrl}/shared`;

    companyIds.push(companyId);

    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.webhook.createMany({
        data: [
          { companyId, url, events: ["contact.created"], secret: SECRET, enabled: true },
          {
            companyId,
            url,
            events: ["contact.created"],
            secret: SECRET,
            bodyTemplate: '{"text": "{{event}}"}',
            enabled: true,
          },
        ],
      });
      await prisma.webhookDelivery.create({
        data: { id: deliveryId, companyId, url, event: "contact.created", requestBody: ENVELOPE },
      });
    });

    const outcome = await deliver({ companyId, deliveryId, url });

    expect(outcome.status).toBe("failed");
    expect(outcome.responseMessage).toContain("unavailable");
    expect(captured).toHaveLength(0);
  });

  it("refuses to guess a historical delivery owner even when shared URLs have no overrides", async () => {
    captured = [];
    const companyId = randomUUID();
    const deliveryId = randomUUID();
    const url = `${baseUrl}/shared-plain`;

    companyIds.push(companyId);

    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.webhook.createMany({
        data: [
          { companyId, url, events: ["contact.created"], secret: SECRET, enabled: true },
          { companyId, url, events: ["contact.created"], secret: SECRET, enabled: true },
        ],
      });
      await prisma.webhookDelivery.create({
        data: { id: deliveryId, companyId, url, event: "contact.created", requestBody: ENVELOPE },
      });
    });

    const outcome = await deliver({ companyId, deliveryId, url });

    expect(outcome.status).toBe("failed");
    expect(captured).toHaveLength(0);
  });

  it("sends persisted identity and payload once when concurrent workers receive forged or duplicate workflow inputs", async () => {
    captured = [];
    const seeded = await seedWebhook({ path: "/duplicates" });
    const inputs = { ...seeded, url: `${baseUrl}/forged`, requestBody: { forged: true } };
    const outcomes = await Promise.all([deliverWebhook.invoke(inputs), deliverWebhook.invoke(inputs)]);
    expect(outcomes.some((outcome) => outcome.status === "success")).toBe(true);
    expect(captured).toHaveLength(1);
    expect(JSON.parse(captured[0].rawBody)).toEqual(ENVELOPE);
    expect(captured[0].headers["x-customermates-delivery-id"]).toBe(seeded.deliveryId);
    expect(await deliver(seeded)).toMatchObject({ status: "success" });
    expect(captured).toHaveLength(1);
  });

  it("recovers an expired delivery lease without allowing its old worker to settle the new attempt", async () => {
    captured = [];
    const seeded = await seedWebhook({ path: "/recovery" });
    const queue = new PrismaWebhookDeliveryQueueRepo();
    const old = await queue.claimUnscoped(seeded.companyId, seeded.deliveryId, new Date());
    if (old.status !== "claimed") throw new Error("Expected a delivery lease");
    await runWithoutTenant(() =>
      prisma.webhookDelivery.update({
        where: { id: seeded.deliveryId, companyId: seeded.companyId },
        data: { leaseExpiresAt: new Date(0) },
      }),
    );
    expect(await deliver(seeded)).toMatchObject({ status: "success" });
    expect(
      await queue.finishUnscoped({
        companyId: seeded.companyId,
        deliveryId: seeded.deliveryId,
        token: old.token,
        success: false,
        statusCode: 500,
        responseMessage: "Obsolete worker",
        nextAttemptAt: new Date(),
      }),
    ).toBe(false);
    const row = await runWithoutTenant(() =>
      prisma.webhookDelivery.findFirstOrThrow({ where: { id: seeded.deliveryId, companyId: seeded.companyId } }),
    );
    expect(row).toMatchObject({ status: "success", attempts: 2, nextAttemptAt: null, leaseToken: null });
    expect(captured).toHaveLength(1);
  });

  it("persists retry timing and retains the delivery ID across a transient receiver failure", async () => {
    captured = [];
    transientFailures = 1;
    const seeded = await seedWebhook({ path: "/retry" });
    expect(await deliver(seeded)).toMatchObject({
      status: "failed",
      statusCode: 503,
      nextAttemptAt: expect.any(String),
    });
    expect(await deliver(seeded)).toMatchObject({ status: "pending" });
    expect(captured).toHaveLength(1);
    await runWithoutTenant(() =>
      prisma.webhookDelivery.update({
        where: { id: seeded.deliveryId, companyId: seeded.companyId },
        data: { nextAttemptAt: new Date(0) },
      }),
    );
    expect(await deliver(seeded)).toMatchObject({ status: "success" });
    expect(captured).toHaveLength(2);
    expect(captured.map((request) => request.headers["x-customermates-delivery-id"])).toEqual([
      seeded.deliveryId,
      seeded.deliveryId,
    ]);
  });

  it("does not follow redirects with a signed payload", async () => {
    captured = [];
    const seeded = await seedWebhook({ path: "/redirect" });
    expect(await deliver(seeded)).toMatchObject({ status: "failed", statusCode: 302 });
    expect(captured).toHaveLength(1);
    const row = await runWithoutTenant(() =>
      prisma.webhookDelivery.findFirstOrThrow({ where: { id: seeded.deliveryId, companyId: seeded.companyId } }),
    );
    expect(row.nextAttemptAt).toBeNull();
  });

  it("delivers the unchanged envelope when no headers or template are configured", async () => {
    captured = [];
    const seeded = await seedWebhook({ path: "/default", headers: null, bodyTemplate: null });

    const outcome = await deliver(seeded);

    expect(outcome.status).toBe("success");
    expect(JSON.parse(captured[0].rawBody)).toEqual(ENVELOPE);
    expect(Object.keys(captured[0].headers).filter((name) => name.startsWith("x-"))).toEqual([
      "x-customermates-delivery-id",
      "x-webhook-signature",
    ]);
  });
});
