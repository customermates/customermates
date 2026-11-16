import type {
  IncomingWebhookDto,
  ManageIncomingWebhookData,
} from "@/features/incoming-webhook/incoming-webhook.schema";

import { IncomingWebhookMappingSchema } from "@/features/incoming-webhook/incoming-webhook.schema";

export type MappingRow = { path: string; fieldId: string };

export type IncomingWebhookForm = {
  id: string;
  typeId: string;
  name: string;
  enabled: boolean;
  mode: "create" | "upsert";
  matchFieldId: string;
  rows: MappingRow[];
  signingSecret: string;
  clearSecret: boolean;
  hasSecret: boolean;
  signatureHeader: string;
  sample: string;
};

export const DEFAULT_SIGNATURE_HEADER = "x-signature";

export const EMPTY_MAPPING_ROW: MappingRow = { path: "", fieldId: "" };

export function emptyForm(typeId: string): IncomingWebhookForm {
  return {
    id: "",
    typeId,
    name: "",
    enabled: true,
    mode: "create",
    matchFieldId: "",
    rows: [{ ...EMPTY_MAPPING_ROW }],
    signingSecret: "",
    clearSecret: false,
    hasSecret: false,
    signatureHeader: DEFAULT_SIGNATURE_HEADER,
    sample: "",
  };
}

export function formOf(webhook: IncomingWebhookDto): IncomingWebhookForm {
  return {
    id: webhook.id,
    typeId: webhook.typeId,
    name: webhook.name,
    enabled: webhook.enabled,
    mode: webhook.mapping.mode,
    matchFieldId: webhook.mapping.matchFieldId ?? "",
    rows: webhook.mapping.fields.map((field) => ({ path: field.path, fieldId: field.fieldId })),
    signingSecret: "",
    clearSecret: false,
    hasSecret: webhook.hasSigningSecret,
    signatureHeader: webhook.signatureHeader,
    sample: webhook.samplePayload === null ? "" : JSON.stringify(webhook.samplePayload, null, 2),
  };
}

export function parseSample(text: string): { ok: true; value: Record<string, unknown> | null } | { ok: false } {
  if (text.trim().length === 0) return { ok: true, value: null };
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value: value as Record<string, unknown> }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

export function mappingOf(form: IncomingWebhookForm) {
  const parsed = IncomingWebhookMappingSchema.safeParse({
    mode: form.mode,
    matchFieldId: form.mode === "upsert" ? form.matchFieldId || null : null,
    fields: form.rows
      .filter((row) => row.path.trim() && row.fieldId)
      .map((row) => ({ path: row.path.trim(), fieldId: row.fieldId })),
  });
  return parsed.success ? parsed.data : null;
}

export function saveRequest(form: IncomingWebhookForm): ManageIncomingWebhookData | null {
  const mapping = mappingOf(form);
  const sample = parseSample(form.sample);
  if (!mapping || !sample.ok || form.name.trim().length === 0) return null;
  const signatureHeader = form.signatureHeader.trim().toLowerCase() || DEFAULT_SIGNATURE_HEADER;
  const secret = form.signingSecret.trim();
  if (form.id) {
    return {
      action: "update",
      id: form.id,
      name: form.name.trim(),
      enabled: form.enabled,
      mapping,
      signatureHeader,
      samplePayload: sample.value,
      ...(form.clearSecret ? { signingSecret: null } : secret ? { signingSecret: secret } : {}),
    } as ManageIncomingWebhookData;
  }
  return {
    action: "create",
    typeId: form.typeId,
    name: form.name.trim(),
    enabled: form.enabled,
    mapping,
    signatureHeader,
    ...(secret ? { signingSecret: secret } : {}),
    ...(sample.value ? { samplePayload: sample.value } : {}),
  } as ManageIncomingWebhookData;
}
