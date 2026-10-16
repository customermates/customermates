import { z } from "zod";

import { AiManageableDataViewSurfaceKeySchema } from "@/core/data-view/ai-manageable-surfaces";
import { DATA_VIEW_NAME_MAX_LENGTH } from "@/core/data-view/data-view-limits";
import { ViewKeySchema } from "@/core/data-view/data-view-identity.schema";

export const AGENT_CONTEXT_ATTACHMENT_LIMIT = 5;
export const AGENT_FILE_ATTACHMENT_LIMIT = 10;

const AgentDataViewCreateContextReferenceSchema = z
  .object({
    kind: z.literal("dataView"),
    surfaceKey: AiManageableDataViewSurfaceKeySchema,
    proposedName: z.string().trim().min(1).max(DATA_VIEW_NAME_MAX_LENGTH).optional(),
    requestedAction: z.literal("create"),
  })
  .strict();

const AgentDataViewUpdateContextReferenceSchema = z
  .object({
    kind: z.literal("dataView"),
    surfaceKey: AiManageableDataViewSurfaceKeySchema,
    viewKey: ViewKeySchema,
    requestedAction: z.literal("update"),
  })
  .strict();

const AgentRecordContextReferenceSchema = z
  .object({ kind: z.literal("record"), typeId: z.uuid(), recordId: z.uuid() })
  .strict();

const AgentConfigurationContextReferenceSchema = z.union([
  z.object({ kind: z.literal("dataModel") }).strict(),
  z.object({ kind: z.literal("recordType"), typeId: z.uuid() }).strict(),
  z
    .object({
      kind: z.literal("recordField"),
      typeId: z.uuid(),
      fieldId: z.uuid(),
    })
    .strict(),
  z.object({ kind: z.literal("widget"), widgetId: z.uuid() }).strict(),
]);

const AgentFileContextReferenceSchema = z
  .object({
    kind: z.literal("file"),
    fileId: z.uuid(),
    mimeType: z.string().max(255),
    size: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export const AgentContextReferenceSchema = z.union([
  AgentDataViewCreateContextReferenceSchema,
  AgentDataViewUpdateContextReferenceSchema,
  AgentRecordContextReferenceSchema,
  AgentConfigurationContextReferenceSchema,
  AgentFileContextReferenceSchema,
]);

export type AgentContextReference = z.infer<typeof AgentContextReferenceSchema>;
export type AgentFileContextReference = z.infer<typeof AgentFileContextReferenceSchema>;

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/gu;
const LABEL_WHITESPACE_PATTERN = /\s+/gu;

function normalizeAgentContextLabel(value: string): string {
  return value
    .replace(CONTROL_CHARACTER_PATTERN, " ")
    .replace(LABEL_WHITESPACE_PATTERN, " ")
    .trim()
    .slice(0, 200)
    .trimEnd();
}

export const AgentContextAttachmentSchema = z
  .object({
    reference: AgentContextReferenceSchema,
    label: z.string().transform(normalizeAgentContextLabel).pipe(z.string().min(1)),
  })
  .strict();

export type AgentContextAttachment = z.infer<typeof AgentContextAttachmentSchema>;
export type AgentFileContext = AgentContextAttachment & { reference: AgentFileContextReference };

export function isAgentFileContext(context: AgentContextAttachment): context is AgentFileContext {
  return context.reference.kind === "file";
}

function contextLimit(context: AgentContextAttachment): number {
  return isAgentFileContext(context) ? AGENT_FILE_ATTACHMENT_LIMIT : AGENT_CONTEXT_ATTACHMENT_LIMIT;
}

export function agentContextAttachmentKey(context: AgentContextAttachment | AgentContextReference): string {
  const reference = "reference" in context ? context.reference : context;
  if (reference.kind === "record") return `record:v2:${reference.typeId}:${reference.recordId}`;
  if (reference.kind === "file") return `file:${reference.fileId}`;
  if (reference.kind === "dataModel") return "dataModel";
  if (reference.kind === "recordType") return `recordType:${reference.typeId}`;
  if (reference.kind === "recordField") return `recordField:${reference.typeId}:${reference.fieldId}`;
  if (reference.kind === "widget") return `widget:${reference.widgetId}`;
  return [
    "dataView",
    reference.surfaceKey,
    reference.requestedAction,
    reference.requestedAction === "update" ? reference.viewKey : (reference.proposedName ?? ""),
  ].join(":");
}

export const AgentContextAttachmentsSchema = z
  .array(AgentContextAttachmentSchema)
  .max(AGENT_CONTEXT_ATTACHMENT_LIMIT + AGENT_FILE_ATTACHMENT_LIMIT)
  .superRefine((contexts, refinement) => {
    const keys = new Set<string>();
    let dataViewSeen = false;
    const files = contexts.filter(isAgentFileContext).length;
    if (files > AGENT_FILE_ATTACHMENT_LIMIT || contexts.length - files > AGENT_CONTEXT_ATTACHMENT_LIMIT) {
      refinement.addIssue({
        code: "custom",
        message: `Attach at most ${AGENT_CONTEXT_ATTACHMENT_LIMIT} contexts and ${AGENT_FILE_ATTACHMENT_LIMIT} files.`,
        path: [],
      });
    }
    contexts.forEach((context, index) => {
      if (context.reference.kind === "dataView") {
        if (dataViewSeen) {
          refinement.addIssue({
            code: "custom",
            message: "Only one data view context can be attached.",
            path: [index, "reference"],
          });
        }
        dataViewSeen = true;
      }
      const key = agentContextAttachmentKey(context);
      if (keys.has(key)) {
        refinement.addIssue({
          code: "custom",
          message: "Context attachments must be unique.",
          path: [index, "reference"],
        });
      }
      keys.add(key);
    });
  });

const AgentContextMessagePartSchema = z
  .object({
    type: z.literal("context"),
    context: AgentContextAttachmentSchema,
  })
  .strict();

export function agentContextsFromMessageParts(parts: unknown): AgentContextAttachment[] {
  if (!Array.isArray(parts)) return [];
  const contexts: AgentContextAttachment[] = [];
  const keys = new Set<string>();
  let dataViewSeen = false;
  for (const part of parts) {
    const parsed = AgentContextMessagePartSchema.safeParse(part);
    if (!parsed.success) continue;
    const context = parsed.data.context;
    const sameClass = contexts.filter((existing) => isAgentFileContext(existing) === isAgentFileContext(context));
    if (sameClass.length >= contextLimit(context)) continue;
    if (context.reference.kind === "dataView") {
      if (dataViewSeen) continue;
      dataViewSeen = true;
    }
    const key = agentContextAttachmentKey(context);
    if (keys.has(key)) continue;
    keys.add(key);
    contexts.push(context);
  }
  return contexts;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function providerAttributes(context: AgentContextAttachment): Record<string, string> {
  const reference = context.reference;
  if (reference.kind === "file") {
    return {
      kind: reference.kind,
      fileId: reference.fileId,
      name: context.label,
      mimeType: reference.mimeType,
      size: String(reference.size),
    };
  }
  if (reference.kind !== "dataView") return reference;
  return {
    kind: reference.kind,
    surfaceKey: reference.surfaceKey,
    ...(reference.requestedAction === "update" ? { viewKey: reference.viewKey } : {}),
    ...(reference.requestedAction === "create" && reference.proposedName
      ? { proposedName: reference.proposedName }
      : {}),
    requestedAction: reference.requestedAction,
  };
}

export function agentContextProviderPrefix(contexts: readonly AgentContextAttachment[]): string {
  const keys = new Set<string>();
  const blocks: string[] = [];
  const counts = { files: 0, others: 0 };
  for (const context of contexts) {
    const parsed = AgentContextAttachmentSchema.safeParse(context);
    if (!parsed.success) continue;
    const key = agentContextAttachmentKey(parsed.data);
    if (keys.has(key)) continue;
    const counter = isAgentFileContext(parsed.data) ? "files" : "others";
    if (counts[counter] >= contextLimit(parsed.data)) continue;
    keys.add(key);
    counts[counter] += 1;
    blocks.push(
      `<selected_context ${Object.entries(providerAttributes(parsed.data))
        .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
        .join(" ")}/>`,
    );
  }
  return blocks.length > 0 ? `${blocks.join("\n")}\n` : "";
}

const PROVIDER_PREFIX_LINE = /^<(?:page_context|selected_context) [^\n]*\/>$/;

export function agentContextFromProviderText(text: string): { body: string } {
  const lines = text.split("\n");
  const bodyStart = lines.findIndex((line) => !PROVIDER_PREFIX_LINE.test(line));
  return { body: bodyStart === -1 ? "" : lines.slice(bodyStart).join("\n") };
}

export function agentContextAttachmentsEqual(
  left: readonly AgentContextAttachment[],
  right: readonly AgentContextAttachment[],
): boolean {
  if (left.length !== right.length) return false;
  const leftKeys = left.map(agentContextAttachmentKey).toSorted();
  const rightKeys = right.map(agentContextAttachmentKey).toSorted();
  return leftKeys.every((key, index) => key === rightKeys[index]);
}
