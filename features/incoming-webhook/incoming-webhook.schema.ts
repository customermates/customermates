import { z } from "zod";

export const INCOMING_WEBHOOK_LIMITS = {
  maxBodyBytes: 256 * 1024,
  storedPayloadBytes: 16 * 1024,
  maxFields: 40,
  webhookBucket: { capacity: 120, windowMs: 60_000 },
  visitorBucket: { capacity: 300, windowMs: 60_000 },
  retentionDays: 30,
  maxDeliveriesListed: 100,
} as const;

export const INCOMING_WEBHOOK_OUTCOMES = [
  "created",
  "updated",
  "rejected_signature",
  "rejected_payload",
  "rejected_plan",
  "rejected_limit",
  "failed",
] as const;
export type IncomingWebhookOutcome = (typeof INCOMING_WEBHOOK_OUTCOMES)[number];

const JSON_PATH = /^[A-Za-z0-9_$-]+(?:\.[A-Za-z0-9_$-]+|\[\d{1,4}\])*$/u;

export const IncomingWebhookBodySchema = z
  .record(z.string(), z.unknown())
  .describe("A JSON object, such as the body another system posts to the endpoint.");

export const IncomingWebhookFieldMappingSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .max(200)
      .regex(JSON_PATH)
      .describe("Where the value sits in the JSON body, such as data.email or items[0].name."),
    fieldId: z.uuid().describe("The field of the list that receives the value."),
  })
  .strict();

export const IncomingWebhookMappingSchema = z
  .object({
    mode: z
      .enum(["create", "upsert"])
      .describe("create adds a record for every request; upsert updates the record that matches."),
    matchFieldId: z
      .uuid()
      .nullable()
      .describe("For upsert: the mapped field whose value finds the existing record. Null for create."),
    fields: z
      .array(IncomingWebhookFieldMappingSchema)
      .min(1)
      .max(INCOMING_WEBHOOK_LIMITS.maxFields)
      .refine((fields) => new Set(fields.map((field) => field.fieldId)).size === fields.length, {
        message: "Each field can be mapped once",
      }),
  })
  .strict()
  .superRefine((mapping, ctx) => {
    if (mapping.mode === "upsert" && !mapping.fields.some((field) => field.fieldId === mapping.matchFieldId))
      ctx.addIssue({ code: "custom", path: ["matchFieldId"], message: "upsert needs a mapped match field" });
  });
export type IncomingWebhookMapping = z.infer<typeof IncomingWebhookMappingSchema>;

const SignatureHeaderSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{1,64}$/u)
  .describe("Header that carries the HMAC-SHA256 hex signature of the raw body.");

export const IncomingWebhookDtoSchema = z
  .object({
    id: z.uuid(),
    typeId: z.uuid(),
    name: z.string(),
    enabled: z.boolean(),
    url: z.string(),
    hasSigningSecret: z.boolean(),
    signatureHeader: z.string(),
    mapping: IncomingWebhookMappingSchema,
    samplePayload: IncomingWebhookBodySchema.nullable(),
    lastReceivedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type IncomingWebhookDto = z.infer<typeof IncomingWebhookDtoSchema>;

export const IncomingWebhookDeliveryDtoSchema = z
  .object({
    id: z.uuid(),
    outcome: z.enum(INCOMING_WEBHOOK_OUTCOMES),
    statusCode: z.number().int(),
    message: z.string().nullable(),
    recordId: z.uuid().nullable(),
    payloadBytes: z.number().int(),
    payload: IncomingWebhookBodySchema.nullable(),
    createdAt: z.string(),
  })
  .strict();
export type IncomingWebhookDeliveryDto = z.infer<typeof IncomingWebhookDeliveryDtoSchema>;

export const IncomingWebhookFieldOptionSchema = z
  .object({
    fieldId: z.uuid(),
    label: z.string(),
    valueType: z.string(),
    required: z.boolean(),
    multiple: z.boolean(),
    options: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
  })
  .strict();

export const IncomingWebhookPreviewSchema = z
  .object({
    ok: z.boolean(),
    outcome: z.enum(["create", "update"]).nullable(),
    existingRecordId: z.uuid().nullable(),
    values: z.array(
      z
        .object({
          fieldId: z.uuid(),
          path: z.string(),
          value: z.string().nullable(),
          error: z.enum(["required", "invalid"]).nullable(),
        })
        .strict(),
    ),
  })
  .strict();
export type IncomingWebhookPreview = z.infer<typeof IncomingWebhookPreviewSchema>;

export const ManageIncomingWebhookSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("list"), typeId: z.uuid().optional() }).strict(),
    z.object({ action: z.literal("get"), id: z.uuid() }).strict(),
    z.object({ action: z.literal("fields"), typeId: z.uuid() }).strict(),
    z
      .object({
        action: z.literal("create"),
        typeId: z.uuid(),
        name: z.string().trim().min(1).max(120),
        mapping: IncomingWebhookMappingSchema,
        enabled: z.boolean().optional(),
        signatureHeader: SignatureHeaderSchema.optional(),
        signingSecret: z.string().min(8).max(256).optional(),
        samplePayload: IncomingWebhookBodySchema.optional(),
      })
      .strict(),
    z
      .object({
        action: z.literal("update"),
        id: z.uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        mapping: IncomingWebhookMappingSchema.optional(),
        enabled: z.boolean().optional(),
        signatureHeader: SignatureHeaderSchema.optional(),
        signingSecret: z.string().min(8).max(256).nullable().optional(),
        samplePayload: IncomingWebhookBodySchema.nullable().optional(),
        rotateUrl: z.boolean().optional(),
      })
      .strict(),
    z.object({ action: z.literal("delete"), id: z.uuid() }).strict(),
    z.object({ action: z.literal("test"), id: z.uuid(), payload: IncomingWebhookBodySchema.optional() }).strict(),
    z
      .object({
        action: z.literal("deliveries"),
        id: z.uuid(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .strict(),
  ])
  .describe("Manage the incoming webhook endpoints of a list.");
export type ManageIncomingWebhookData = z.infer<typeof ManageIncomingWebhookSchema>;

export const IncomingWebhookResultSchema = z
  .object({
    items: z.array(IncomingWebhookDtoSchema).optional(),
    webhook: IncomingWebhookDtoSchema.optional(),
    deleted: z.literal(true).optional(),
    preview: IncomingWebhookPreviewSchema.optional(),
    deliveries: z.array(IncomingWebhookDeliveryDtoSchema).optional(),
    fields: z.array(IncomingWebhookFieldOptionSchema).optional(),
    typeLabel: z.string().optional(),
  })
  .strict();
export type IncomingWebhookResult = z.infer<typeof IncomingWebhookResultSchema>;

export type IncomingWebhookReceiveResult = {
  status: number;
  body: { ok: boolean; outcome?: "created" | "updated"; recordId?: string; error?: string };
  retryAfterSeconds?: number;
};
