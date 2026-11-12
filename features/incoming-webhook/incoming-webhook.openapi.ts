import { structuredOperation } from "@/core/openapi/structured-operation";

import { IncomingWebhookResultSchema, ManageIncomingWebhookSchema } from "./incoming-webhook.schema";

const [listAction, getAction, fieldsAction, createAction, updateAction, deleteAction, testAction, deliveriesAction] =
  ManageIncomingWebhookSchema.options;

const TYPE_ID = "0b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e";
const FIELD_ID = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
const HOOK_ID = "4f3e2d1c-0b9a-4876-9543-210fedcba987";

const REQUIRES =
  "read access to the API and webhooks resource, plus the create, update or delete permission for the action; a plan with webhooks on the cloud, no restriction on self-hosted workspaces.";

const exampleMapping = {
  mode: "upsert",
  matchFieldId: FIELD_ID,
  fields: [{ path: "data.email", fieldId: FIELD_ID }],
};

export const incomingWebhookApiPaths = {
  "/v1/incoming-webhooks/list": {
    post: structuredOperation({
      operationId: "listIncomingWebhooks",
      summary: "List incoming webhooks",
      description:
        "Lists the incoming webhook endpoints of the workspace or of one list. Each carries its secret url, which receives POST requests with a JSON body, and its field mapping. The signing secret itself is never returned.",
      requires: REQUIRES,
      tag: "incoming-webhooks",
      input: listAction.omit({ action: true }),
      output: IncomingWebhookResultSchema,
      outputDescription: "The endpoints in items.",
      example: { typeId: TYPE_ID },
    }),
  },
  "/v1/incoming-webhooks/read": {
    post: structuredOperation({
      operationId: "readIncomingWebhook",
      summary: "Read an incoming webhook",
      description: "Returns one endpoint with its url and mapping. An id that does not exist answers 404.",
      requires: REQUIRES,
      tag: "incoming-webhooks",
      input: getAction.omit({ action: true }),
      output: IncomingWebhookResultSchema,
      outputDescription: "The endpoint in webhook.",
      example: { id: HOOK_ID },
    }),
  },
  "/v1/incoming-webhooks/fields": {
    post: structuredOperation({
      operationId: "listIncomingWebhookFields",
      summary: "List the fields a mapping can fill",
      description:
        "Returns the fields of a list that an incoming webhook can fill: input fields of type text, formatted text, number, currency, yes/no, date, single or multiple choice, link and contact details.",
      requires: REQUIRES,
      tag: "incoming-webhooks",
      input: fieldsAction.omit({ action: true }),
      output: IncomingWebhookResultSchema,
      outputDescription: "The usable fields in fields.",
      example: { typeId: TYPE_ID },
    }),
  },
  "/v1/incoming-webhooks/create": {
    post: structuredOperation({
      operationId: "createIncomingWebhook",
      summary: "Create an incoming webhook",
      description:
        "Creates an endpoint that creates or updates records of a list from JSON posted to its secret url (POST /api/hooks/{token}). mapping lists JSON paths and the fields they fill; mode upsert updates the record whose match field equals the mapped value. With signingSecret, every request must carry the hex HMAC-SHA256 of the raw body in signatureHeader (default x-signature, an optional sha256= prefix is accepted). Bodies over 256 KB and bursts over the rate limits are refused. An Idempotency-Key request header of at least 8 characters makes a retried request create nothing twice. Records are created as the member who created the endpoint, with the endpoint named as their source.",
      requires: REQUIRES,
      tag: "incoming-webhooks",
      input: createAction.omit({ action: true }),
      output: IncomingWebhookResultSchema,
      outputDescription: "The endpoint in webhook, with its secret url.",
      example: { typeId: TYPE_ID, name: "Website signups", mapping: exampleMapping },
    }),
  },
  "/v1/incoming-webhooks/update": {
    post: structuredOperation({
      operationId: "updateIncomingWebhook",
      summary: "Update an incoming webhook",
      description:
        "Changes the name, mapping, signature check or state of an endpoint. Only supplied fields change; signingSecret null clears the secret; rotateUrl true replaces the secret url and the old one stops working.",
      requires: REQUIRES,
      tag: "incoming-webhooks",
      input: updateAction.omit({ action: true }),
      output: IncomingWebhookResultSchema,
      outputDescription: "The endpoint in webhook.",
      example: { id: HOOK_ID, enabled: false },
    }),
  },
  "/v1/incoming-webhooks/delete": {
    post: structuredOperation({
      operationId: "deleteIncomingWebhook",
      summary: "Delete an incoming webhook",
      description: "Deletes the endpoint and its delivery log permanently. Its url stops answering at once.",
      requires: REQUIRES,
      tag: "incoming-webhooks",
      input: deleteAction.omit({ action: true }),
      output: IncomingWebhookResultSchema,
      outputDescription: "deleted: true.",
      example: { id: HOOK_ID },
    }),
  },
  "/v1/incoming-webhooks/test": {
    post: structuredOperation({
      operationId: "testIncomingWebhook",
      summary: "Test an incoming webhook mapping",
      description:
        "Maps a JSON body with the endpoint's mapping and returns, per mapped field, the value it would store or why it fails, and whether the body would create or update a record. Nothing is written. Without payload the stored sample body is used.",
      requires: REQUIRES,
      tag: "incoming-webhooks",
      input: testAction.omit({ action: true }),
      output: IncomingWebhookResultSchema,
      outputDescription: "The preview.",
      example: { id: HOOK_ID, payload: { data: { email: "ada@example.com" } } },
    }),
  },
  "/v1/incoming-webhooks/deliveries": {
    post: structuredOperation({
      operationId: "listIncomingWebhookDeliveries",
      summary: "List incoming webhook deliveries",
      description:
        "Returns the recent requests the endpoint received, newest first: outcome, HTTP status, message, the record it touched and, for bodies up to 16 KB, the body. Deliveries are kept for 30 days.",
      requires: REQUIRES,
      tag: "incoming-webhooks",
      input: deliveriesAction.omit({ action: true }),
      output: IncomingWebhookResultSchema,
      outputDescription: "The deliveries.",
      example: { id: HOOK_ID, limit: 25 },
    }),
  },
};
