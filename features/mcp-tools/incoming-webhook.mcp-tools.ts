import { z } from "zod";

import { mcpValidationFailure, runInteractor, toonResult } from "./utils";

import { getManageIncomingWebhookInteractor } from "@/core/di";
import {
  IncomingWebhookBodySchema,
  IncomingWebhookMappingSchema,
  ManageIncomingWebhookSchema,
} from "@/features/incoming-webhook/incoming-webhook.schema";

const ACTIONS = ["list", "get", "fields", "create", "update", "delete", "test", "deliveries"] as const;

const ManageIncomingWebhooksSchema = z.object({
  action: z
    .enum(ACTIONS)
    .describe(
      "Incoming webhook operation. Keys per action: list: typeId; get: id; fields: typeId; create: typeId, name, mapping, enabled, signatureHeader, signingSecret, samplePayload; update: id, name, mapping, enabled, signatureHeader, signingSecret, samplePayload, rotateUrl; delete: id; test: id, payload; deliveries: id, limit.",
    ),
  id: z
    .uuid()
    .optional()
    .describe("The incoming webhook id. Required for every action except list, fields and create."),
  typeId: z
    .uuid()
    .optional()
    .describe(
      "The list whose records the webhook creates or updates. Required for fields and create; optional for list.",
    ),
  name: z.string().optional().describe("A name for the endpoint; the records it creates name it as their source."),
  mapping: IncomingWebhookMappingSchema.optional().describe(
    "How the JSON body fills the list: mode create or upsert, matchFieldId (upsert only: the mapped field that finds the existing record) and fields, each a JSON path such as data.email and the fieldId it fills. Required for create; on update it replaces the stored mapping.",
  ),
  enabled: z.boolean().optional().describe("create (default true) and update."),
  signatureHeader: z
    .string()
    .optional()
    .describe("Header that carries the hex HMAC-SHA256 of the raw body. Default x-signature."),
  signingSecret: z
    .string()
    .nullable()
    .optional()
    .describe(
      "When set, every request must carry a valid signature in signatureHeader. update: omit to keep, null to clear. The secret is not returned.",
    ),
  samplePayload: IncomingWebhookBodySchema.nullable()
    .optional()
    .describe("An example body kept with the endpoint for test."),
  rotateUrl: z.boolean().optional().describe("update only. true replaces the secret URL; the old URL stops working."),
  payload: IncomingWebhookBodySchema.optional().describe(
    "test only. The body to try; defaults to the stored samplePayload.",
  ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("deliveries only. How many recent deliveries, default 25."),
});

type Params = z.infer<typeof ManageIncomingWebhooksSchema>;

const ACTION_KEYS: Record<Params["action"], ReadonlyArray<keyof Params>> = {
  list: ["typeId"],
  get: ["id"],
  fields: ["typeId"],
  create: ["typeId", "name", "mapping", "enabled", "signatureHeader", "signingSecret", "samplePayload"],
  update: ["id", "name", "mapping", "enabled", "signatureHeader", "signingSecret", "samplePayload", "rotateUrl"],
  delete: ["id"],
  test: ["id", "payload"],
  deliveries: ["id", "limit"],
};

const OutputSchema = z
  .looseObject({
    items: z.array(z.looseObject({ id: z.string() })).optional(),
    webhook: z.looseObject({ id: z.string(), url: z.string() }).optional(),
    deleted: z.literal(true).optional(),
    preview: z.looseObject({ ok: z.boolean() }).optional(),
    deliveries: z.array(z.looseObject({ id: z.string() })).optional(),
    fields: z.array(z.looseObject({ fieldId: z.string() })).optional(),
  })
  .describe(
    "list returns items; get, create and update return webhook with its secret url; delete returns deleted; test returns preview, what the mapping would write for the body without writing it; deliveries returns the recent deliveries; fields returns the fields of the list a mapping can fill.",
  );

function relevantInput(params: Params): Record<string, unknown> {
  const relevant = ACTION_KEYS[params.action].flatMap((key) => {
    const value = params[key];
    const dropped = value === undefined || (value === null && params.action === "create");
    return dropped ? [] : [[key, value] as const];
  });
  return { action: params.action, ...Object.fromEntries(relevant) };
}

export const manageIncomingWebhooksTool = {
  name: "manage_incoming_webhooks",
  title: "Manage incoming webhooks",
  description:
    "Lets an outside system such as a form tool, a website, GitHub or Stripe create or update records in a list by posting JSON to a secret URL. " +
    "Each endpoint belongs to one list and maps JSON paths of the body to its fields; mode upsert updates the record whose match field equals the mapped value and creates one otherwise. " +
    "action fields lists the fields a mapping can fill. action create requires typeId, name and mapping and returns webhook.url, the secret address that receives POST requests. " +
    "With signingSecret set, every request must carry an HMAC-SHA256 signature of the raw body in signatureHeader. Requests larger than 256 KB or arriving too fast are refused. " +
    "action test shows what a body would write, field by field, without writing anything; action deliveries shows the delivery log with the outcome of each request. " +
    "action update with rotateUrl true replaces the secret address. action delete is IRREVERSIBLE. " +
    "Records are created as the member who created the endpoint, with the endpoint named as their source. Incoming webhooks need a plan with webhooks on the cloud and work on every self-hosted workspace.",
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  inputSchema: ManageIncomingWebhooksSchema,
  outputSchema: OutputSchema,
  execute: async (params: Params) => {
    const parsed = ManageIncomingWebhookSchema.safeParse(relevantInput(params));
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    return runInteractor(getManageIncomingWebhookInteractor().invoke(parsed.data), (result) =>
      toonResult({ ...result }),
    );
  },
};
