import { describe, expect, it } from "vitest";

import { EntityType } from "@/generated/prisma";

import {
  AGENT_CONTEXT_RECORD_ENTITIES,
  AgentContextAttachmentSchema,
  AgentContextAttachmentsSchema,
  agentContextAttachmentKey,
  agentContextAttachmentsEqual,
  agentContextProviderPrefix,
  agentContextsFromMessageParts,
  type AgentContextAttachment,
} from "../agent-context";
import {
  clientSafeAgentMessageParts,
  hasRenderableAgentMessageParts,
  partsToText,
  SendAgentMessageSchema,
  userMessagePartsToProviderText,
} from "../agent-chat.schema";
import { conservativeAgentInitialContextBytes } from "../agent-provider-context";

const VIEW_ID = "11111111-1111-4111-8111-111111111111";
const RECORD_ID = "22222222-2222-4222-8222-222222222222";

const viewContext: AgentContextAttachment = {
  reference: {
    kind: "dataView",
    surfaceKey: "contacts-card-store",
    viewKey: VIEW_ID,
    requestedAction: "update",
  },
  label: "Qualified contacts",
};

const recordContext: AgentContextAttachment = {
  reference: { kind: "record", entityType: "contact", recordId: RECORD_ID },
  label: 'Julian "CEO" <private>',
};

describe("agent context contract", () => {
  it("covers every record entity type", () => {
    expect([...AGENT_CONTEXT_RECORD_ENTITIES].sort()).toEqual(Object.values(EntityType).sort());
  });

  it("accepts canonical view and record references while normalizing display labels", () => {
    expect(
      AgentContextAttachmentSchema.parse({
        ...viewContext,
        label: "  Qualified contacts  ",
      }),
    ).toEqual(viewContext);
    expect(AgentContextAttachmentSchema.parse(recordContext)).toEqual(recordContext);
    expect(
      AgentContextAttachmentSchema.safeParse({
        ...viewContext,
        reference: {
          kind: "dataView",
          surfaceKey: "contacts-card-store",
          requestedAction: "create",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects invalid or duplicated attachments and normalizes unsafe label whitespace", () => {
    expect(
      AgentContextAttachmentSchema.safeParse({
        ...viewContext,
        reference: {
          kind: "dataView",
          surfaceKey: "contacts-card-store",
          requestedAction: "update",
        },
      }).success,
    ).toBe(false);
    expect(
      AgentContextAttachmentSchema.safeParse({
        ...viewContext,
        reference: {
          kind: "dataView",
          surfaceKey: "contacts-card-store",
          viewKey: VIEW_ID,
          requestedAction: "create",
        },
      }).success,
    ).toBe(false);
    expect(
      AgentContextAttachmentSchema.safeParse({
        ...viewContext,
        reference: {
          kind: "dataView",
          surfaceKey: "contacts-card-store",
          viewKey: VIEW_ID,
        },
      }).success,
    ).toBe(false);
    expect(
      AgentContextAttachmentSchema.safeParse({
        ...viewContext,
        reference: { ...viewContext.reference, unexpected: true },
      }).success,
    ).toBe(false);
    expect(
      AgentContextAttachmentSchema.parse({
        ...recordContext,
        label: "Bad\n\tlabel",
      }).label,
    ).toBe("Bad label");
    expect(
      AgentContextAttachmentSchema.safeParse({
        ...recordContext,
        label: "\n\t",
      }).success,
    ).toBe(false);
    expect(AgentContextAttachmentsSchema.safeParse([viewContext, viewContext]).success).toBe(false);
    expect(
      AgentContextAttachmentsSchema.safeParse([
        viewContext,
        {
          reference: {
            kind: "dataView",
            surfaceKey: "deals-card-store",
            requestedAction: "create",
          },
          label: "New deals view",
        },
      ]).success,
    ).toBe(false);
    expect(AgentContextAttachmentsSchema.safeParse(Array.from({ length: 6 }, () => recordContext)).success).toBe(false);
    expect(AgentContextAttachmentSchema.parse({ ...recordContext, label: "x".repeat(511) }).label).toHaveLength(200);
  });

  it("requires an attached data view to match the exact page target", () => {
    const request = {
      clientRequestId: "33333333-3333-4333-8333-333333333333",
      text: "Update it",
      contexts: [viewContext],
      pageContext: {
        route: `/en/contacts?view=${VIEW_ID}&viewSurface=contacts-card-store&viewAction=update`,
      },
    };

    expect(SendAgentMessageSchema.safeParse(request).success).toBe(true);
    expect(
      SendAgentMessageSchema.safeParse({
        ...request,
        pageContext: { route: `/en/deals?view=${VIEW_ID}&viewSurface=deals-card-store&viewAction=update` },
      }).success,
    ).toBe(false);
    expect(SendAgentMessageSchema.safeParse({ ...request, pageContext: undefined }).success).toBe(false);
  });

  it("carries a proposed create name as canonical provider context", () => {
    const namedCreate: AgentContextAttachment = {
      reference: {
        kind: "dataView",
        surfaceKey: "contacts-card-store",
        proposedName: "Qualified leads",
        requestedAction: "create",
      },
      label: "New view: Qualified leads",
    };

    expect(agentContextProviderPrefix([namedCreate])).toBe(
      '<selected_context kind="dataView" surfaceKey="contacts-card-store" proposedName="Qualified leads" requestedAction="create"/>\n',
    );
  });

  it("provides stable keys and exact attachment equality for request idempotency", () => {
    expect(agentContextAttachmentKey(viewContext)).toBe(`dataView:contacts-card-store:update:${VIEW_ID}`);
    expect(agentContextAttachmentKey(recordContext.reference)).toBe(`record:contact:${RECORD_ID}`);
    expect(agentContextAttachmentsEqual([viewContext, recordContext], [viewContext, recordContext])).toBe(true);
    expect(agentContextAttachmentsEqual([viewContext], [{ ...viewContext, label: "A different display label" }])).toBe(
      true,
    );
    expect(agentContextAttachmentsEqual([viewContext, recordContext], [recordContext, viewContext])).toBe(true);
  });

  it("reads only strict stored context parts and serializes canonical references without labels", () => {
    const parts = [
      { type: "context", context: viewContext },
      { type: "context", context: recordContext },
      { type: "context", context: { ...recordContext, extra: "forged" } },
      { type: "text", text: "Change this view" },
    ];

    expect(agentContextsFromMessageParts(parts)).toEqual([viewContext, recordContext]);
    const prefix = agentContextProviderPrefix([viewContext, recordContext]);
    expect(prefix).toBe(
      `<selected_context kind="dataView" surfaceKey="contacts-card-store" viewKey="${VIEW_ID}" requestedAction="update"/>\n` +
        `<selected_context kind="record" entityType="contact" recordId="${RECORD_ID}"/>\n`,
    );
    expect(prefix).not.toContain(viewContext.label);
    expect(prefix).not.toContain(recordContext.label);
    expect(userMessagePartsToProviderText(parts)).toBe(`${prefix}Change this view`);
    expect(partsToText(parts)).toBe("Change this view");
  });

  it("deduplicates and caps stored context parts before replay", () => {
    const stored = [
      { type: "context", context: viewContext },
      { type: "context", context: viewContext },
      {
        type: "context",
        context: {
          reference: {
            kind: "dataView" as const,
            surfaceKey: "deals-card-store" as const,
            requestedAction: "create" as const,
          },
          label: "New deals view",
        },
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        type: "context",
        context: {
          reference: {
            kind: "record" as const,
            entityType: "contact" as const,
            recordId: `22222222-2222-4222-8222-22222222222${index}`,
          },
          label: `Contact ${index}`,
        },
      })),
    ];

    const contexts = agentContextsFromMessageParts(stored);
    expect(contexts).toHaveLength(5);
    expect(contexts[0]).toEqual(viewContext);
    expect(contexts.filter((context) => context.reference.kind === "dataView")).toHaveLength(1);
    expect(new Set(contexts.map(agentContextAttachmentKey)).size).toBe(5);
  });

  it("exposes context parts only through the explicit user-message path", () => {
    const stored = [{ type: "context", context: viewContext }];
    expect(clientSafeAgentMessageParts(stored)).toEqual([]);
    expect(clientSafeAgentMessageParts(stored, { allowContext: true })).toEqual(stored);
    expect(hasRenderableAgentMessageParts(clientSafeAgentMessageParts(stored, { allowContext: true }))).toBe(false);
  });

  it("includes selected contexts in conservative provider-budget admission", () => {
    const withoutContext = conservativeAgentInitialContextBytes({
      systemPrompt: "System",
      currentText: "Change it",
      pageRoute: null,
      toolDefinitions: [],
    });
    const withContext = conservativeAgentInitialContextBytes({
      systemPrompt: "System",
      currentText: "Change it",
      contexts: [viewContext],
      pageRoute: null,
      toolDefinitions: [],
    });

    expect(withoutContext).not.toBeNull();
    expect(withContext).not.toBeNull();
    expect(withContext ?? 0).toBeGreaterThan(withoutContext ?? 0);
  });
});
