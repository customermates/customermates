import type {
  IncomingWebhookDto,
  ManageIncomingWebhookData,
} from "@/features/incoming-webhook/incoming-webhook.schema";

import { IncomingWebhookMappingSchema } from "@/features/incoming-webhook/incoming-webhook.schema";

export type MappingRow = { path: string; fieldId: string };

export type IncomingWebhookDraft = {
  id: string | null;
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

export function emptyDraft(typeId: string): IncomingWebhookDraft {
  return {
    id: null,
    typeId,
    name: "",
    enabled: true,
    mode: "create",
    matchFieldId: "",
    rows: [{ path: "", fieldId: "" }],
    signingSecret: "",
    clearSecret: false,
    hasSecret: false,
    signatureHeader: DEFAULT_SIGNATURE_HEADER,
    sample: "",
  };
}

export function draftOf(webhook: IncomingWebhookDto): IncomingWebhookDraft {
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

export function mappingOf(draft: IncomingWebhookDraft) {
  const parsed = IncomingWebhookMappingSchema.safeParse({
    mode: draft.mode,
    matchFieldId: draft.mode === "upsert" ? draft.matchFieldId || null : null,
    fields: draft.rows
      .filter((row) => row.path.trim() && row.fieldId)
      .map((row) => ({ path: row.path.trim(), fieldId: row.fieldId })),
  });
  return parsed.success ? parsed.data : null;
}

export function saveRequest(draft: IncomingWebhookDraft): ManageIncomingWebhookData | null {
  const mapping = mappingOf(draft);
  const sample = parseSample(draft.sample);
  if (!mapping || !sample.ok || draft.name.trim().length === 0) return null;
  const signatureHeader = draft.signatureHeader.trim().toLowerCase() || DEFAULT_SIGNATURE_HEADER;
  const secret = draft.signingSecret.trim();
  if (draft.id) {
    return {
      action: "update",
      id: draft.id,
      name: draft.name.trim(),
      enabled: draft.enabled,
      mapping,
      signatureHeader,
      samplePayload: sample.value,
      ...(draft.clearSecret ? { signingSecret: null } : secret ? { signingSecret: secret } : {}),
    } as ManageIncomingWebhookData;
  }
  return {
    action: "create",
    typeId: draft.typeId,
    name: draft.name.trim(),
    enabled: draft.enabled,
    mapping,
    signatureHeader,
    ...(secret ? { signingSecret: secret } : {}),
    ...(sample.value ? { samplePayload: sample.value } : {}),
  } as ManageIncomingWebhookData;
}
