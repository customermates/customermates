import { z } from "zod";

import {
  encodeToToon,
  toonResult,
  FILTER_FIELD_DESCRIPTION,
  FILTER_SYNTAX,
  SORT_SYNTAX,
  formatDatesInResponse,
  mcpPage,
  mcpPageSize,
  mcpInteractorFailure,
  runInteractor,
  customMcpFailure,
  CONTACT_KEY_FIELD_NOTE,
} from "./utils";
import type { McpToolFailureResult } from "./mcp-tool";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { entityListExecutors, entityNameExtractors } from "@/features/search/entity-list-executors";
import {
  getGetContactByIdInteractor,
  getDeleteManyContactsInteractor,
  getGetContactsConfigurationInteractor,
  getUpdateManyContactsInteractor,
  getGetOrganizationByIdInteractor,
  getDeleteManyOrganizationsInteractor,
  getGetOrganizationsConfigurationInteractor,
  getUpdateManyOrganizationsInteractor,
  getGetDealByIdInteractor,
  getDeleteManyDealsInteractor,
  getGetDealsConfigurationInteractor,
  getUpdateManyDealsInteractor,
  getGetServiceByIdInteractor,
  getDeleteManyServicesInteractor,
  getGetServicesConfigurationInteractor,
  getUpdateManyServicesInteractor,
  getGetTaskByIdInteractor,
  getDeleteManyTasksInteractor,
  getGetTasksConfigurationInteractor,
  getUpdateManyTasksInteractor,
  getModifyEntityRelationInteractor,
} from "@/core/di";

const EntitySchema = z
  .enum(["contact", "organization", "deal", "service", "task"])
  .describe("Entity type (one of: contact, organization, deal, service, task)");

const RelationSchema = z
  .enum(["organizations", "contacts", "deals", "services", "tasks", "users"])
  .describe(
    "Relationship to modify. Allowed pairs: " +
      "contact -> organizations|users|deals|tasks; " +
      "organization -> contacts|users|deals|tasks; " +
      "deal -> organizations|users|contacts|services|tasks; " +
      "service -> users|deals|tasks; " +
      "task -> users|contacts|organizations|deals|services",
  );

const RecordSchemaInputSchema = z.object({
  entity: EntitySchema.optional().describe(
    "Entity type (one of: contact, organization, deal, service, task). Omit to get all five schemas in one call.",
  ),
});

const ListRecordsSchema = z.object({
  entity: EntitySchema,
  searchTerm: z.string().optional().describe("Free-text search against the entity's name or related fields"),
  filters: z.array(FilterSchema).optional().describe(FILTER_FIELD_DESCRIPTION),
  sortDescriptor: SortDescriptorSchema.optional(),
  page: mcpPage(),
  pageSize: mcpPageSize(10, "Results per page (one of: 5, 10, 25, 100). Default 10."),
});

const SearchRecordsSchema = z.object({
  searchTerm: z.string().min(1).describe("Free-text query; matches names and related fields across every entity"),
  entities: z
    .array(EntitySchema)
    .optional()
    .describe("Restrict the search to specific entity types. Default: all five."),
  limitPerEntity: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(5)
    .describe("Max results per entity type. Upper bound tracks list pageSize (100)."),
});

const GetRecordsSchema = z.object({
  items: z
    .array(
      z
        .object({
          entity: EntitySchema,
          id: z
            .string()
            .min(1)
            .describe("The record's id. " + CONTACT_KEY_FIELD_NOTE),
          include: z
            .enum(["masterData", "withNotes"])
            .default("masterData")
            .describe("masterData = fields only; withNotes = fields + markdown notes"),
        })
        .strict(),
    )
    .min(1)
    .max(100)
    .describe("Entities to fetch (max 100 per call). Mixed entity types are allowed in a single call."),
});

const UpdateRecordNotesSchema = z.object({
  entity: EntitySchema,
  mode: z
    .enum(["replace", "append"])
    .describe("replace = overwrite existing notes; append = keep existing notes and add after a blank line"),
  items: z
    .array(
      z
        .object({
          id: z
            .string()
            .min(1)
            .describe("The record's id. " + CONTACT_KEY_FIELD_NOTE),
          notes: z
            .string()
            .describe(
              "Markdown notes. With mode replace, an empty string clears the notes; " +
                "an empty string is only meaningful for replace.",
            ),
        })
        .strict(),
    )
    .min(1)
    .max(100),
});

const ManageRecordLinksSchema = z.object({
  action: z
    .enum(["add", "remove"])
    .describe("add = link the ids to the relationship; remove = unlink the ids from the relationship"),
  entity: EntitySchema,
  sourceId: z
    .string()
    .min(1)
    .describe("ID of the source entity whose relationship is being modified. " + CONTACT_KEY_FIELD_NOTE),
  relation: RelationSchema,
  ids: z
    .array(z.uuid())
    .min(1)
    .describe("IDs to add to (link) or remove from (unlink) the source entity's relationship"),
});

const DeleteRecordsSchema = z.object({
  entity: EntitySchema,
  ids: z
    .array(z.string().min(1))
    .min(1)
    .max(100)
    .describe("The records' ids. " + CONTACT_KEY_FIELD_NOTE),
});

const RecordSchemaOutputSchema = z
  .looseObject({ filterSyntax: z.looseObject({}), sortSyntax: z.looseObject({}) })
  .describe(
    "With entity set: that entity's configuration plus syntax help. Without: one configuration per entity type keyed by its name.",
  );

const ListRecordsOutputSchema = z.object({
  items: z.array(
    z
      .looseObject({ id: z.string(), name: z.string().nullable() })
      .describe("Deal items add totalValue, totalQuantity, weightedValue; service items add amount."),
  ),
  total: z.number().describe("Matching records across all pages"),
  sums: z
    .record(z.string(), z.number())
    .optional()
    .describe("Per numeric column: total across every matching record, not just this page"),
  page: z.number(),
  filters: z.array(z.unknown()).optional(),
});

const SearchRecordsOutputSchema = z.object({
  searchTerm: z.string(),
  results: z.array(
    z.object({
      entity: EntitySchema,
      items: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
      total: z.number().optional(),
      error: z.string().optional(),
    }),
  ),
});

const GetRecordsOutputSchema = z.object({
  items: z
    .array(z.looseObject({}))
    .describe(
      "One entry per requested item, in order: the record keyed by its entity name (plus notes when requested), or { error } when that id failed.",
    ),
});

const UpdateRecordNotesOutputSchema = z.object({
  entity: EntitySchema,
  mode: z.enum(["replace", "append"]),
  updated: z.number(),
});

const ManageRecordLinksOutputSchema = z.object({
  action: z.enum(["add", "remove"]),
  relation: RelationSchema,
  requested: z.number(),
  before: z.number().describe("Linked ids in the relationship before the call"),
  after: z.number().describe("Linked ids in the relationship after the call"),
});

const DeleteRecordsOutputSchema = z.object({ entity: EntitySchema, deleted: z.number() });

type Entity = z.infer<typeof EntitySchema>;

const allEntities: Entity[] = ["contact", "organization", "deal", "service", "task"];

const singularLabels: Record<Entity, string> = {
  contact: "contact",
  organization: "organization",
  deal: "deal",
  service: "service",
  task: "task",
};

const configurationExecutors: Record<Entity, () => Promise<{ ok: true; data: unknown }>> = {
  contact: () => getGetContactsConfigurationInteractor().invoke(),
  organization: () => getGetOrganizationsConfigurationInteractor().invoke(),
  deal: () => getGetDealsConfigurationInteractor().invoke(),
  service: () => getGetServicesConfigurationInteractor().invoke(),
  task: () => getGetTasksConfigurationInteractor().invoke(),
};

const detailsExecutors: Record<Entity, (id: string) => Promise<any>> = {
  contact: async (id) => getGetContactByIdInteractor().invoke({ id }),
  organization: async (id) => getGetOrganizationByIdInteractor().invoke({ id }),
  deal: async (id) => getGetDealByIdInteractor().invoke({ id }),
  service: async (id) => getGetServiceByIdInteractor().invoke({ id }),
  task: async (id) => getGetTaskByIdInteractor().invoke({ id }),
};

const deleteExecutors: Record<Entity, (ids: string[]) => Promise<any>> = {
  contact: async (ids) => getDeleteManyContactsInteractor().invoke({ ids }),
  organization: async (ids) => getDeleteManyOrganizationsInteractor().invoke({ ids }),
  deal: async (ids) => getDeleteManyDealsInteractor().invoke({ ids }),
  service: async (ids) => getDeleteManyServicesInteractor().invoke({ ids }),
  task: async (ids) => getDeleteManyTasksInteractor().invoke({ ids }),
};

async function updateManyEntities(
  entity: Entity,
  items: Array<{ id: string } & Record<string, unknown>>,
): Promise<any> {
  if (entity === "contact") return getUpdateManyContactsInteractor().invoke({ contacts: items as any });
  if (entity === "organization") return getUpdateManyOrganizationsInteractor().invoke({ organizations: items as any });
  if (entity === "deal") return getUpdateManyDealsInteractor().invoke({ deals: items as any });
  if (entity === "service") return getUpdateManyServicesInteractor().invoke({ services: items as any });
  return getUpdateManyTasksInteractor().invoke({ tasks: items as any });
}

const entityNotFoundCode: Record<Entity, CustomErrorCode> = {
  contact: CustomErrorCode.contactNotFound,
  organization: CustomErrorCode.organizationNotFound,
  deal: CustomErrorCode.dealNotFound,
  service: CustomErrorCode.serviceNotFound,
  task: CustomErrorCode.taskNotFound,
};

async function loadEntityOrError(
  entity: Entity,
  id: string,
): Promise<{ ok: true; entity: any } | { ok: false; error: McpToolFailureResult }> {
  const result = await detailsExecutors[entity](id);
  if (!result.ok) return { ok: false, error: mcpInteractorFailure(result.error) };
  const key = singularLabels[entity];
  const row = result.data?.[key];
  if (!row) return { ok: false, error: await customMcpFailure(entityNotFoundCode[entity]) };
  return { ok: true, entity: row };
}

export const getRecordSchemaTool = {
  name: "get_record_schema",
  title: "Get record schema",
  description:
    "Use this when you need an entity's schema and custom-column metadata, never record data. " +
    "Optional: entity; omit it to get the schemas for all five entity types in one call. " +
    "Returns the editable fields, custom columns, filter syntax, and sort syntax. " +
    "Call this BEFORE any create / update / filter / sort call so you use valid field names and custom-column ids.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: RecordSchemaInputSchema,
  outputSchema: RecordSchemaOutputSchema,
  execute: async ({ entity }: z.infer<typeof RecordSchemaInputSchema>) => {
    if (entity) {
      const result = await configurationExecutors[entity]();
      return toonResult({
        ...(result.data as Record<string, unknown>),
        filterSyntax: FILTER_SYNTAX,
        sortSyntax: SORT_SYNTAX,
      });
    }

    const configurations = await Promise.all(
      allEntities.map(async (name) => [name, (await configurationExecutors[name]()).data] as const),
    );
    return toonResult({
      ...Object.fromEntries(configurations),
      filterSyntax: FILTER_SYNTAX,
      sortSyntax: SORT_SYNTAX,
    });
  },
};

export const listRecordsTool = {
  name: "list_records",
  title: "List records",
  description:
    "Use this when you need to search, filter, sort, or count records of a single entity type. " +
    "Required: entity. Optional: searchTerm, filters, sortDescriptor, page, pageSize (5/10/25/100, default 10). " +
    "Returns id and name per item plus the matching total (it is always returned, use it for counts too); " +
    "deal items add totalValue, totalQuantity and weightedValue, service items add amount. " +
    "When the entity has numeric columns it also returns sums: the total of each numeric column across " +
    "every record matching the filters, not just the current page. Read sums directly instead of adding " +
    "up items, which would only cover one page. For deals sums holds totalValue (pipeline), totalQuantity " +
    "and weightedValue (pipeline weighted by each stage's win probability). " +
    "Numeric columns of the record are summable; single-select and other custom fields are not, so filter " +
    "or group by those instead. " +
    "Use get_records (batched, pass many ids in one call) to fetch full field/custom-column values.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: ListRecordsSchema,
  outputSchema: ListRecordsOutputSchema,
  execute: async ({
    entity,
    searchTerm,
    filters,
    sortDescriptor,
    page,
    pageSize,
  }: z.infer<typeof ListRecordsSchema>) => {
    const result = await entityListExecutors[entity]({
      searchTerm,
      filters,
      sortDescriptor,
      pagination: { page, pageSize },
    });
    if (!result.ok) return mcpInteractorFailure(result.error);

    return toonResult({
      items: result.data.items.map((item: any) => ({
        id: item.id,
        name: entityNameExtractors[entity](item),
        ...(item.totalValue !== undefined && { totalValue: item.totalValue }),
        ...(item.totalQuantity !== undefined && { totalQuantity: item.totalQuantity }),
        ...(item.weightedValue != null && { weightedValue: item.weightedValue }),
        ...(item.amount !== undefined && { amount: item.amount }),
      })),
      total: result.data.pagination?.total ?? result.data.items.length,
      ...(result.data.valueSums && Object.keys(result.data.valueSums).length > 0
        ? { sums: result.data.valueSums }
        : {}),
      page,
      ...(filters ? { filters } : {}),
    });
  },
};

export const searchRecordsTool = {
  name: "search_records",
  title: "Search records",
  description:
    "Use this when you don't know which entity type holds what you're looking for. " +
    "Free-text search across every entity type in one call. " +
    "Required: searchTerm. Optional: entities (restrict to specific types), limitPerEntity (default 5, max 100). " +
    "Returns up to `limitPerEntity` matches per entity type with { entity, id, name }. " +
    "For filtered/paginated results, use list_records.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: SearchRecordsSchema,
  outputSchema: SearchRecordsOutputSchema,
  execute: async ({ searchTerm, entities, limitPerEntity }: z.infer<typeof SearchRecordsSchema>) => {
    const targets: Entity[] = entities ?? allEntities;
    const pageSize: 5 | 10 | 25 | 100 =
      limitPerEntity <= 5 ? 5 : limitPerEntity <= 10 ? 10 : limitPerEntity <= 25 ? 25 : 100;

    const results = await Promise.all(
      targets.map(async (entity) => {
        const result = await entityListExecutors[entity]({
          searchTerm,
          pagination: { page: 1, pageSize },
        });
        if (!result.ok) return { entity, items: [], error: z.prettifyError(result.error) };
        return {
          entity,
          items: result.data.items.slice(0, limitPerEntity).map((item: any) => ({
            id: item.id,
            name: entityNameExtractors[entity](item),
          })),
          total: result.data.pagination?.total ?? result.data.items.length,
        };
      }),
    );

    return toonResult({ searchTerm, results });
  },
};

export const getRecordsTool = {
  name: "get_records",
  title: "Get records",
  description:
    "Use this when you need full record data for known ids. Mixed entity types are allowed in one call. " +
    "Required per item: entity, id (for contacts, id may also be an email, phone, or 'provider:handle' channel key). " +
    "Optional per item: include (masterData = fields only, default; withNotes = fields + markdown notes). " +
    "Each result item is the full record, or { error } for an id that was not found, so inspect every item even when the call succeeds. " +
    "Use this before update_* or manage_record_links when you need the current state.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: GetRecordsSchema,
  outputSchema: GetRecordsOutputSchema,
  execute: async ({ items }: z.infer<typeof GetRecordsSchema>) => {
    const results = await Promise.all(
      items.map(async ({ entity, id, include }) => {
        const loaded = await loadEntityOrError(entity, id);
        if (!loaded.ok) return { error: loaded.error.text };

        const key = singularLabels[entity];
        const { notes, ...masterData } = loaded.entity as Record<string, unknown> & { notes?: unknown };
        if (include === "withNotes") {
          const markdown = notes ? serializeJSONToMarkdown(notes as object) : null;
          return formatDatesInResponse({ [key]: masterData, notes: markdown });
        }

        return formatDatesInResponse({ [key]: masterData });
      }),
    );

    return { text: encodeToToon(results), structuredContent: { items: results } };
  },
};

export const updateRecordNotesTool = {
  name: "update_record_notes",
  title: "Update record notes",
  description:
    "Use this when you need to write markdown notes on up to 100 records of a single entity type. " +
    "Required: entity, mode (replace or append), items[{id, notes}] " +
    "(for contacts, id may be a UUID or an email/phone/'provider:handle' channel key). " +
    "replace overwrites the notes; an empty string clears them (only meaningful for replace). " +
    "append preserves existing notes and adds the new markdown after a blank line. " +
    "Only replace is idempotent. " +
    "A validation error may reference the underlying entity array name (e.g. contacts[0].id) whose index matches your items index.",
  annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: UpdateRecordNotesSchema,
  outputSchema: UpdateRecordNotesOutputSchema,
  execute: async ({ entity, mode, items }: z.infer<typeof UpdateRecordNotesSchema>) => {
    if (mode === "replace") {
      const normalized = items.map(({ id, notes }) => ({
        id,
        notes: notes.trim() === "" ? null : parseMarkdownToJSON(notes),
      }));
      return runInteractor(
        updateManyEntities(entity, normalized),
        () => `Updated notes for ${normalized.length} ${singularLabels[entity]}(s)`,
        () => ({ entity, mode, updated: normalized.length }),
      );
    }

    const loadedItems = await Promise.all(
      items.map(async ({ id, notes }) => {
        const loaded = await loadEntityOrError(entity, id);
        if (!loaded.ok) return { ok: false as const, error: loaded.error };
        const existingMarkdown = loaded.entity.notes ? serializeJSONToMarkdown(loaded.entity.notes) : "";
        const combined = existingMarkdown ? `${existingMarkdown}\n\n${notes}` : notes;
        return { ok: true as const, payload: { id, notes: parseMarkdownToJSON(combined) } };
      }),
    );
    const firstError = loadedItems.find((r) => !r.ok);
    if (firstError && !firstError.ok) return firstError.error;
    const merged = loadedItems
      .filter((r): r is { ok: true; payload: { id: string; notes: object } } => r.ok)
      .map((r) => r.payload);

    const result = await updateManyEntities(entity, merged);
    if (!result.ok) return mcpInteractorFailure(result.error);
    return {
      text: `Appended notes on ${merged.length} ${singularLabels[entity]}(s)`,
      structuredContent: { entity, mode, updated: merged.length },
    };
  },
};

export const manageRecordLinksTool = {
  name: "manage_record_links",
  title: "Manage record links",
  description:
    "Use this when you need to add or remove links between records. " +
    "Required: action (add or remove), entity, sourceId, relation, ids. " +
    "Other links stay untouched; remove never deletes the related record. " +
    "Allowed pairs: contact -> organizations|users|deals|tasks; organization -> contacts|users|deals|tasks; " +
    "deal -> organizations|users|contacts|services|tasks; service -> users|deals|tasks; " +
    "task -> users|contacts|organizations|deals|services. " +
    "deal -> services adds with quantity 1 (use update_deals for exact quantities). " +
    "Idempotent: adding a linked id or removing an unlinked id is a no-op. " +
    "If an error message mentions the field `mode`, it refers to this tool's `action` argument.",
  annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: ManageRecordLinksSchema,
  outputSchema: ManageRecordLinksOutputSchema,
  execute: ({ action, entity, sourceId, relation, ids }: z.infer<typeof ManageRecordLinksSchema>) =>
    runInteractor(
      getModifyEntityRelationInteractor().invoke({ entity, sourceId, relation, mode: action, ids }),
      ({ requested, before, after }) =>
        action === "add"
          ? `Linked ${requested} ${relation} to ${entity} ${sourceId} (was ${before}, now ${after})`
          : `Unlinked ${requested} ${relation} from ${entity} ${sourceId} (was ${before}, now ${after})`,
      ({ requested, before, after }) => ({ action, relation, requested, before, after }),
    ),
};

export const deleteRecordsTool = {
  name: "delete_records",
  title: "Delete records",
  description:
    "Use this when records must be permanently deleted. IRREVERSIBLE. " +
    "Deletes up to 100 records by id for a single entity type. " +
    "Required: entity, ids (for contacts, each id may be a UUID or an email/phone/'provider:handle' channel key). " +
    "This cannot be undone. Consider exporting first. Repeating a delete leaves state unchanged, but ids that no longer exist come back as per-id errors.",
  annotations: { readOnlyHint: false, idempotentHint: true, destructiveHint: true, openWorldHint: false },
  inputSchema: DeleteRecordsSchema,
  outputSchema: DeleteRecordsOutputSchema,
  execute: ({ entity, ids }: z.infer<typeof DeleteRecordsSchema>) =>
    runInteractor(
      deleteExecutors[entity](ids),
      (data: any) => `Deleted ${data.length} ${singularLabels[entity]}(s)`,
      (data: any) => ({ entity, deleted: data.length }),
    ),
};
