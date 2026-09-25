import { z } from "zod";

import type { EntityType } from "@/generated/prisma";

import { AiManageableDataViewSurfaceKeySchema } from "@/core/data-view/ai-manageable-surfaces";
import { DATA_VIEW_NAME_MAX_LENGTH } from "@/core/data-view/data-view-limits";
import { ViewKeySchema } from "@/core/data-view/data-view-identity.schema";

export const AGENT_CONTEXT_ATTACHMENT_LIMIT = 5;
export const AGENT_CONTEXT_RECORD_ENTITIES = [
  "contact",
  "organization",
  "deal",
  "service",
  "task",
] as const satisfies readonly EntityType[];

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
  .object({
    kind: z.literal("record"),
    entityType: z.enum(AGENT_CONTEXT_RECORD_ENTITIES),
    recordId: z.uuid(),
  })
  .strict();

export const AgentContextReferenceSchema = z.union([
  AgentDataViewCreateContextReferenceSchema,
  AgentDataViewUpdateContextReferenceSchema,
  AgentRecordContextReferenceSchema,
]);

export type AgentContextReference = z.infer<typeof AgentContextReferenceSchema>;

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

export function agentContextAttachmentKey(context: AgentContextAttachment | AgentContextReference): string {
  const reference = "reference" in context ? context.reference : context;
  if (reference.kind === "record") return `record:${reference.entityType}:${reference.recordId}`;
  return [
    "dataView",
    reference.surfaceKey,
    reference.requestedAction,
    reference.requestedAction === "update" ? reference.viewKey : (reference.proposedName ?? ""),
  ].join(":");
}

export const AgentContextAttachmentsSchema = z
  .array(AgentContextAttachmentSchema)
  .max(AGENT_CONTEXT_ATTACHMENT_LIMIT)
  .superRefine((contexts, refinement) => {
    const keys = new Set<string>();
    let dataViewSeen = false;
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
    if (parsed.data.context.reference.kind === "dataView") {
      if (dataViewSeen) continue;
      dataViewSeen = true;
    }
    const key = agentContextAttachmentKey(parsed.data.context);
    if (keys.has(key)) continue;
    keys.add(key);
    contexts.push(parsed.data.context);
    if (contexts.length === AGENT_CONTEXT_ATTACHMENT_LIMIT) break;
  }
  return contexts;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function agentContextProviderPrefix(contexts: readonly AgentContextAttachment[]): string {
  const keys = new Set<string>();
  const blocks: string[] = [];
  for (const context of contexts) {
    const parsed = AgentContextAttachmentSchema.safeParse(context);
    if (!parsed.success) continue;
    const key = agentContextAttachmentKey(parsed.data);
    if (keys.has(key)) continue;
    keys.add(key);
    const reference = parsed.data.reference;
    const attributes =
      reference.kind === "record"
        ? {
            kind: reference.kind,
            entityType: reference.entityType,
            recordId: reference.recordId,
          }
        : {
            kind: reference.kind,
            surfaceKey: reference.surfaceKey,
            ...(reference.requestedAction === "update" ? { viewKey: reference.viewKey } : {}),
            ...(reference.requestedAction === "create" && reference.proposedName
              ? { proposedName: reference.proposedName }
              : {}),
            requestedAction: reference.requestedAction,
          };
    blocks.push(
      `<selected_context ${Object.entries(attributes)
        .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
        .join(" ")}/>`,
    );
    if (blocks.length === AGENT_CONTEXT_ATTACHMENT_LIMIT) break;
  }
  return blocks.length > 0 ? `${blocks.join("\n")}\n` : "";
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
