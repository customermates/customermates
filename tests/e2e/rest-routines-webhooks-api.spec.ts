import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { APIRequestContext } from "@playwright/test";
import { z } from "zod";

import { RecordModelSchema } from "../../features/records/record-model.schema";
import {
  createOpenApiValidator,
  type OpenApiDocument,
} from "../helpers/openapi-validator";
import { localE2eEnvironment } from "./local-environment";
import { test, expect } from "./fixtures";

type Method = "get" | "post" | "patch";

test("drives routines and webhooks through the public REST API with an API key and its OpenAPI contract", async ({
  context,
  playwright,
  database,
  companyId,
}) => {
  test.setTimeout(240000);
  const { baseUrl } = localE2eEnvironment();
  const keyResponse = await context.request.post(
    `${baseUrl}/api/auth/api-key/create`,
    {
      headers: { origin: baseUrl },
      data: { name: "Local REST parity verification", expiresIn: 86400 },
    },
  );
  expect(keyResponse.ok()).toBe(true);
  const credential = z
    .object({ key: z.string() })
    .parse(await keyResponse.json());
  const api = await playwright.request.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: { "x-api-key": credential.key },
  });
  const anonymous = await playwright.request.newContext({ baseURL: baseUrl });

  const received: Array<{ deliveryId: string | undefined; body: unknown }> = [];
  const receiver = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      received.push({
        deliveryId: request.headers["x-customermates-delivery-id"] as
          | string
          | undefined,
        body: JSON.parse(body),
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
    });
  });
  await new Promise<void>((resolve) =>
    receiver.listen(0, "127.0.0.1", resolve),
  );
  const receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/rest-parity`;

  try {
    const specResponse = await api.get("/api/v1/openapi");
    expect(specResponse.status()).toBe(200);
    const validator = createOpenApiValidator(
      (await specResponse.json()) as OpenApiDocument,
    );

    const call = async (
      client: APIRequestContext,
      method: Method,
      specPath: string,
      url: string,
      status: number,
      body?: unknown,
    ) => {
      if (body !== undefined)
        expect(
          validator.request(specPath, method, body),
          `${method} ${url} request`,
        ).toEqual([]);
      const response = await client.fetch(`/api${url}`, {
        method: method.toUpperCase(),
        data: body,
      });
      const text = await response.text();
      expect(response.status(), `${method} ${url}: ${text}`).toBe(status);
      const json: unknown = JSON.parse(text);
      expect(
        validator.response(specPath, method, status, json),
        `${method} ${url} response`,
      ).toEqual([]);
      return json as Record<string, unknown> & {
        items: Array<Record<string, unknown>>;
      };
    };

    const snapshot = await database.query(
      'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
      [companyId],
    );
    const model = RecordModelSchema.parse(snapshot.rows[0]?.snapshot);
    const type = model.types.find(
      (candidate) =>
        !candidate.embedded &&
        model.fields.some(
          (field) =>
            field.id === candidate.primaryFieldId &&
            field.valueType === "text" &&
            field.behavior.kind === "input",
        ),
    );
    if (!type?.primaryFieldId)
      throw new Error("The workspace needs a list with a text primary field");
    const fieldId = type.primaryFieldId;
    const filter = {
      fieldId,
      operator: "eq",
      value: { kind: "text", value: "REST parity" },
    };

    await call(
      anonymous,
      "post",
      "/v1/routines/list",
      "/v1/routines/list",
      401,
      {},
    );

    const recordRoutine = await call(
      api,
      "post",
      "/v1/routines/create",
      "/v1/routines/create",
      201,
      {
        name: "REST record routine",
        prompt: "Summarize the new record without sending messages.",
        enabled: false,
        triggerKind: "event",
        triggerEvents: ["record.created"],
        recordTrigger: {
          query: { typeId: type.id, filters: [filter] },
          changedFieldIds: [],
        },
        expectedSchemaRevision: model.revision,
      },
    );
    expect(recordRoutine).toMatchObject({
      enabled: false,
      recordTrigger: { query: { typeId: type.id, filters: [filter] } },
    });

    const sourcesRoutine = await call(
      api,
      "post",
      "/v1/routines/create",
      "/v1/routines/create",
      201,
      {
        name: "REST record sources routine",
        prompt: "Summarize the changed record without sending messages.",
        enabled: false,
        triggerKind: "event",
        triggerEvents: ["record.created", "record.updated"],
        recordSources: [
          {
            query: { typeId: type.id, filters: [filter] },
            changedFieldIds: [],
            events: ["record.created", "record.updated"],
          },
        ],
        expectedSchemaRevision: model.revision,
      },
    );
    expect(sourcesRoutine).toMatchObject({
      recordTrigger: null,
      recordSources: [{ query: { typeId: type.id } }],
    });

    const messagingRoutine = await call(
      api,
      "post",
      "/v1/routines/create",
      "/v1/routines/create",
      201,
      {
        name: "REST messaging routine",
        prompt: "Draft a reply to the received message without sending it.",
        enabled: false,
        triggerKind: "event",
        triggerEvents: ["messaging.message.received"],
      },
    );

    const scheduleRoutine = await call(
      api,
      "post",
      "/v1/routines/create",
      "/v1/routines/create",
      201,
      {
        name: "REST schedule routine",
        prompt: "List overdue tasks without changing them.",
        enabled: false,
        triggerKind: "schedule",
        cronExpression: "0 8 * * 1-5",
        timezone: "Europe/Berlin",
      },
    );

    const listed = await call(
      api,
      "post",
      "/v1/routines/list",
      "/v1/routines/list",
      200,
      {
        searchTerm: "REST",
        pagination: { page: 1, pageSize: 25 },
      },
    );
    expect(listed.items.map(({ id }) => id).sort()).toEqual(
      [
        recordRoutine.id,
        sourcesRoutine.id,
        messagingRoutine.id,
        scheduleRoutine.id,
      ].sort(),
    );

    const readBack = await call(
      api,
      "post",
      "/v1/routines/read",
      "/v1/routines/read",
      200,
      { id: recordRoutine.id },
    );
    expect(readBack).toMatchObject({
      id: recordRoutine.id,
      triggerEvents: ["record.created"],
    });

    const renamed = await call(
      api,
      "post",
      "/v1/routines/update",
      "/v1/routines/update",
      200,
      {
        id: scheduleRoutine.id,
        name: "REST weekday schedule",
      },
    );
    expect(renamed).toMatchObject({
      name: "REST weekday schedule",
      cronExpression: "0 8 * * 1-5",
    });

    await call(api, "post", "/v1/routines/run", "/v1/routines/run", 409, {
      id: scheduleRoutine.id,
    });
    const resumed = await call(
      api,
      "post",
      "/v1/routines/resume",
      "/v1/routines/resume",
      200,
      {
        id: scheduleRoutine.id,
      },
    );
    expect(resumed).toMatchObject({ enabled: true });

    const refusedRun = await call(
      api,
      "post",
      "/v1/routines/run",
      "/v1/routines/run",
      422,
      {
        id: scheduleRoutine.id,
      },
    );
    expect(refusedRun).toMatchObject({
      error: { kind: "unavailable", issues: [{ customCode: "routineAiWorkPaused" }] },
    });
    const runs = await call(
      api,
      "post",
      "/v1/routines/runs",
      "/v1/routines/runs",
      200,
      {
        id: scheduleRoutine.id,
      },
    );
    expect(runs.runs).toEqual([]);

    const paused = await call(
      api,
      "post",
      "/v1/routines/pause",
      "/v1/routines/pause",
      200,
      {
        id: scheduleRoutine.id,
      },
    );
    expect(paused).toMatchObject({ enabled: false });

    const deleted = await call(
      api,
      "post",
      "/v1/routines/delete",
      "/v1/routines/delete",
      200,
      {
        id: messagingRoutine.id,
      },
    );
    expect(deleted).toMatchObject({
      id: messagingRoutine.id,
      trashBatchId: expect.any(String),
    });
    await call(api, "post", "/v1/routines/read", "/v1/routines/read", 404, {
      id: messagingRoutine.id,
    });

    const webhook = await call(
      api,
      "post",
      "/v1/webhooks",
      "/v1/webhooks",
      201,
      {
        url: receiverUrl,
        events: ["record.created"],
        recordTrigger: {
          query: { typeId: type.id, filters: [] },
          changedFieldIds: [],
        },
        expectedSchemaRevision: model.revision,
        secret: "rest-parity-signing-secret",
      },
    );
    const webhookPath = `/v1/webhooks/${String(webhook.id)}`;

    await call(anonymous, "get", "/v1/webhooks", "/v1/webhooks", 401);
    const webhooks = await call(
      api,
      "get",
      "/v1/webhooks",
      "/v1/webhooks?page=1&pageSize=25&searchTerm=rest-parity",
      200,
    );
    expect(webhooks.items).toEqual([
      expect.objectContaining({ id: webhook.id, hasSecret: true }),
    ]);
    expect(JSON.stringify(webhooks)).not.toContain(
      "rest-parity-signing-secret",
    );

    const updated = await call(
      api,
      "patch",
      "/v1/webhooks/{id}",
      webhookPath,
      200,
      {
        description: "REST parity receiver",
      },
    );
    expect(updated).toMatchObject({
      id: webhook.id,
      description: "REST parity receiver",
      url: receiverUrl,
    });
    const webhookRead = await call(
      api,
      "get",
      "/v1/webhooks/{id}",
      webhookPath,
      200,
    );
    expect(webhookRead).toMatchObject({
      id: webhook.id,
      description: "REST parity receiver",
    });
    const missing = await call(
      api,
      "get",
      "/v1/webhooks/{id}",
      `/v1/webhooks/${randomUUID()}`,
      404,
    );
    expect(missing).toMatchObject({ error: { kind: "not_found" } });

    const created = await api.post("/api/v1/records/mutate", {
      data: {
        expectedRevision: model.revision,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId: type.id,
          fields: [{ fieldId, value: { kind: "text", value: "REST parity" } }],
        },
      },
    });
    expect(created.status(), await created.text()).toBe(200);

    await expect.poll(() => received.length, { timeout: 90000 }).toBe(1);
    const deliveryPath = `${webhookPath}/deliveries`;
    await expect
      .poll(
        async () => {
          const deliveries = await call(
            api,
            "get",
            "/v1/webhooks/{id}/deliveries",
            deliveryPath,
            200,
          );
          return deliveries.items.map(({ status }) => status);
        },
        { timeout: 60000 },
      )
      .toEqual(["success"]);
    const deliveries = await call(
      api,
      "get",
      "/v1/webhooks/{id}/deliveries",
      `${deliveryPath}?pageSize=10`,
      200,
    );
    const deliveryId = String(deliveries.items[0]?.id);

    const resent = await call(
      api,
      "post",
      "/v1/webhooks/{id}/deliveries/{deliveryId}/resend",
      `${deliveryPath}/${deliveryId}/resend`,
      202,
      {},
    );
    expect(resent).toMatchObject({
      resentDeliveryId: deliveryId,
      deliveryId: expect.any(String),
    });
    await expect.poll(() => received.length, { timeout: 90000 }).toBe(2);
    expect(received[1].body).toMatchObject({ event: "record.created" });

    await call(
      api,
      "post",
      "/v1/webhooks/{id}/deliveries/{deliveryId}/resend",
      `${deliveryPath}/${randomUUID()}/resend`,
      404,
      {},
    );
  } finally {
    await api.dispose();
    await anonymous.dispose();
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  }
});
