import { describe, expect, it } from "vitest";

import { incomingWebhookSignature, incomingWebhookSignatureValid } from "../incoming-webhook-signature";
import {
  INCOMING_WEBHOOK_TOKEN_PATTERN,
  incomingWebhookIdFromToken,
  incomingWebhookToken,
  incomingWebhookTokenValid,
  incomingWebhookUrl,
} from "../incoming-webhook-token";
import { mapIncomingPayload, readJsonPath } from "../incoming-webhook-mapping";
import { IncomingWebhookMappingSchema } from "../incoming-webhook.schema";
import {
  CONTACT_FIELD,
  HOOK_ID,
  NAME_FIELD,
  NOTES_FIELD,
  PAYLOAD,
  SECRET,
  SIZE_FIELD,
  SOURCE_FIELD,
  TYPE_ID,
  createMapping,
  createModel,
} from "./incoming-webhook-fixtures";

const model = createModel();

describe("incoming webhook token", () => {
  it("encodes the id and a signature of the id and the token version", () => {
    const token = incomingWebhookToken(HOOK_ID, 1, SECRET);

    expect(token).toMatch(INCOMING_WEBHOOK_TOKEN_PATTERN);
    expect(incomingWebhookIdFromToken(token)).toBe(HOOK_ID);
    expect(incomingWebhookTokenValid(token, HOOK_ID, 1, SECRET)).toBe(true);
  });

  it("stops working when the url is rotated", () => {
    const token = incomingWebhookToken(HOOK_ID, 1, SECRET);

    expect(incomingWebhookTokenValid(token, HOOK_ID, 2, SECRET)).toBe(false);
    expect(incomingWebhookTokenValid(incomingWebhookToken(HOOK_ID, 2, SECRET), HOOK_ID, 2, SECRET)).toBe(true);
  });

  it("rejects another secret, another webhook id and malformed values", () => {
    const token = incomingWebhookToken(HOOK_ID, 1, SECRET);

    expect(incomingWebhookTokenValid(token, HOOK_ID, 1, "other-secret")).toBe(false);
    expect(incomingWebhookTokenValid(token, "00000000-0000-4000-8000-0000000000ca", 1, SECRET)).toBe(false);
    expect(incomingWebhookIdFromToken("short")).toBeNull();
    expect(incomingWebhookIdFromToken(token.toUpperCase())).toBeNull();
  });

  it("builds the receiving url under /api/hooks", () => {
    expect(incomingWebhookUrl("https://app.example.com/", HOOK_ID, 1, SECRET)).toBe(
      `https://app.example.com/api/hooks/${incomingWebhookToken(HOOK_ID, 1, SECRET)}`,
    );
  });
});

describe("incoming webhook signature", () => {
  const body = JSON.stringify({ hello: "world" });
  const signature = incomingWebhookSignature("shared", body);

  it("accepts the hex HMAC-SHA256 of the raw body, with or without a sha256= prefix", () => {
    expect(incomingWebhookSignatureValid("shared", body, signature)).toBe(true);
    expect(incomingWebhookSignatureValid("shared", body, `sha256=${signature}`)).toBe(true);
    expect(incomingWebhookSignatureValid("shared", body, ` SHA256=${signature.toUpperCase()} `)).toBe(true);
  });

  it("rejects a missing, malformed, foreign or body-mismatching signature", () => {
    expect(incomingWebhookSignatureValid("shared", body, null)).toBe(false);
    expect(incomingWebhookSignatureValid("shared", body, "abc")).toBe(false);
    expect(incomingWebhookSignatureValid("other", body, signature)).toBe(false);
    expect(incomingWebhookSignatureValid("shared", `${body} `, signature)).toBe(false);
  });
});

describe("readJsonPath", () => {
  it("follows dots and indexes", () => {
    expect(readJsonPath(PAYLOAD, "data.name")).toBe("Ada Lovelace");
    expect(readJsonPath(PAYLOAD, "data.tags[1]")).toBe("b");
    expect(readJsonPath(PAYLOAD, "data.deep.items[0].id")).toBe(7);
    expect(readJsonPath(PAYLOAD, "data.missing.value")).toBeUndefined();
    expect(readJsonPath("text", "a")).toBeUndefined();
  });
});

describe("IncomingWebhookMappingSchema", () => {
  it("requires a mapped match field for upsert and unique target fields", () => {
    expect(IncomingWebhookMappingSchema.safeParse(createMapping()).success).toBe(true);
    expect(IncomingWebhookMappingSchema.safeParse(createMapping({ mode: "upsert", matchFieldId: null })).success).toBe(
      false,
    );
    expect(
      IncomingWebhookMappingSchema.safeParse(createMapping({ mode: "upsert", matchFieldId: NAME_FIELD })).success,
    ).toBe(true);
    expect(
      IncomingWebhookMappingSchema.safeParse(
        createMapping({
          fields: [
            { path: "a", fieldId: NAME_FIELD },
            { path: "b", fieldId: NAME_FIELD },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      IncomingWebhookMappingSchema.safeParse(createMapping({ fields: [{ path: "a b", fieldId: NAME_FIELD }] })).success,
    ).toBe(false);
  });
});

describe("mapIncomingPayload", () => {
  it("converts the mapped paths into typed record values", () => {
    const result = mapIncomingPayload(createMapping(), PAYLOAD, TYPE_ID, model.fields);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fields).toEqual([
      { fieldId: NAME_FIELD, value: { kind: "text", value: "Ada Lovelace" } },
      { fieldId: NOTES_FIELD, value: expect.objectContaining({ kind: "richText" }) },
      { fieldId: SOURCE_FIELD, value: { kind: "select", value: "web" } },
      { fieldId: SIZE_FIELD, value: { kind: "decimal", value: "12", currency: null } },
    ]);
    expect(result.match).toBeNull();
    expect(result.values.map((value) => value.error)).toEqual([null, null, null, null]);
  });

  it("finds a select option by its id or by its label in any case", () => {
    const mapping = createMapping({ fields: [{ path: "data.source", fieldId: SOURCE_FIELD }] });

    for (const source of ["web", "Website", " website "]) {
      const result = mapIncomingPayload(mapping, { data: { source } }, TYPE_ID, model.fields);
      expect(result.ok && result.fields[0].value).toEqual({ kind: "select", value: "web" });
    }
    expect(mapIncomingPayload(mapping, { data: { source: "Unknown" } }, TYPE_ID, model.fields).ok).toBe(false);
  });

  it("reports a required list field that arrives empty and a value of the wrong shape", () => {
    const result = mapIncomingPayload(createMapping(), { data: { name: "", size: "many" } }, TYPE_ID, model.fields);

    expect(result.ok).toBe(false);
    expect(result.values.filter((value) => value.error).map((value) => [value.path, value.error])).toEqual([
      ["data.name", "required"],
      ["data.size", "invalid"],
    ]);
  });

  it("refuses a mapping to a field that is not usable any more", () => {
    const mapping = createMapping({ fields: [{ path: "x", fieldId: "00000000-0000-4000-8000-00000000ffff" }] });

    expect(mapIncomingPayload(mapping, { x: "1" }, TYPE_ID, model.fields)).toMatchObject({
      ok: false,
      values: [{ error: "invalid" }],
    });
  });

  it("marks the match value of an upsert and fails when the body lacks it", () => {
    const upsert = createMapping({
      mode: "upsert",
      matchFieldId: CONTACT_FIELD,
      fields: [
        { path: "data.email", fieldId: CONTACT_FIELD },
        { path: "data.name", fieldId: NAME_FIELD },
      ],
    });

    const found = mapIncomingPayload(
      upsert,
      { data: { email: "Ada@Example.com", name: "Ada" } },
      TYPE_ID,
      model.fields,
    );
    expect(found.ok && found.match).toEqual({
      fieldId: CONTACT_FIELD,
      scalar: null,
      identity: { provider: "mail", value: "ada@example.com" },
    });

    const missing = mapIncomingPayload(upsert, { data: { name: "Ada" } }, TYPE_ID, model.fields);
    expect(missing.ok).toBe(false);
    expect(missing.values.find((value) => value.fieldId === CONTACT_FIELD)?.error).toBe("required");
  });

  it("takes the match of a plain field as a scalar", () => {
    const upsert = createMapping({
      mode: "upsert",
      matchFieldId: NAME_FIELD,
      fields: [{ path: "data.name", fieldId: NAME_FIELD }],
    });

    const result = mapIncomingPayload(upsert, PAYLOAD, TYPE_ID, model.fields);

    expect(result.ok && result.match).toEqual({
      fieldId: NAME_FIELD,
      scalar: { kind: "text", value: "Ada Lovelace" },
      identity: null,
    });
  });

  it("accepts booleans, dates with a time and arrays", () => {
    const mapping = createMapping({
      fields: [
        { path: "agree", fieldId: "00000000-0000-4000-8000-0000000000e4" },
        { path: "name", fieldId: NAME_FIELD },
      ],
    });

    const result = mapIncomingPayload(mapping, { agree: "true", name: ["first", "second"] }, TYPE_ID, model.fields);

    expect(result.ok && result.fields).toEqual([
      { fieldId: "00000000-0000-4000-8000-0000000000e4", value: { kind: "boolean", value: true } },
      { fieldId: NAME_FIELD, value: { kind: "text", value: "first" } },
    ]);
  });
});
