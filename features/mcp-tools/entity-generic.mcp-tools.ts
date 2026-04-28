import { z } from "zod";

import { encodeToToon, FILTER_FIELD_DESCRIPTION, FILTER_SYNTAX, SORT_SYNTAX, formatDatesInResponse } from "./utils";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { CustomFieldValueSchema } from "@/core/base/base-entity.schema";
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

const FilterEntitySchema = z.object({
  entity: EntitySchema,
  searchTerm: z.string().optional().describe("Free-text search against the entity's name or related fields"),
  filters: z.array(FilterSchema).optional().describe(FILTER_FIELD_DESCRIPTION),
  sortDescriptor: SortDescriptorSchema.optional(),
  page: z.number().int().min(1).default(1).describe("1-indexed page number"),
  pageSize: z
    .union([z.literal(5), z.literal(10), z.literal(25), z.literal(100)])
    .default(10)
    .describe("Results per page (one of: 5, 10, 25, 100). Default 10."),
});

const SearchAllSchema = z.object({
  searchTerm: z.string().min(1).describe("Free-text query; matches names and related fields across every entity"),
  entities: z
    .array(EntitySchema)
    .optional()
    .describe("Restrict the search to specific entity types. Default: all five."),
  limitPerEntity: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(5)
    .describe("Max results per entity type. Upper bound tracks list pageSize (100)."),
});

const AppendNotesSchema = z.object({
  entity: EntitySchema,
  items: z
    .array(
      z.object({
        id: z.uuid(),
        notes: z.string().min(1).describe("Markdown to append. A blank line is inserted between old and new notes."),
      }),
    )
    .min(1)
    .max(100),
});

const CountEntitySchema = z.object({
  entity: EntitySchema,
  filters: z.array(FilterSchema).optional().describe(FILTER_FIELD_DESCRIPTION),
  sortDescriptor: SortDescriptorSchema.optional(),
});

const DetailsEntitySchema = z.object({
  items: z
    .array(
      z.object({
        entity: EntitySchema,
        id: z.uuid(),
        include: z
          .enum(["masterData", "withNotes"])
          .default("masterData")
          .describe("masterData = fields only; withNotes = fields + markdown notes"),
      }),
    )
    .min(1)
    .describe("Entities to fetch. Mixed entity types are allowed in a single call."),
});

const NotesEntitySchema = z.object({
  entity: EntitySchema,
  items: z
    .array(
      z.object({
        id: z.uuid(),
        notes: z.string().describe("Markdown notes. Pass an empty string to clear."),
      }),
    )
    .min(1)
    .max(100),
});

const DeleteEntitySchema = z.object({
  entity: EntitySchema,
  ids: z.array(z.uuid()).min(1).max(100),
});

const UpdateCustomFieldEntitySchema = z.object({
  entity: EntitySchema,
  items: z
    .array(
      z.object({
        id: z.uuid(),
        customFieldValues: z.array(CustomFieldValueSchema),
      }),
    )
    .min(1)
    .max(100),
});

const LinkEntitiesSchema = z.object({
  entity: EntitySchema,
  sourceId: z.uuid().describe("ID of the entity whose relationship is being modified"),
  relation: RelationSchema,
  ids: z
    .array(z.uuid())
    .min(1)
    .describe("IDs to add to (link) or remove from (unlink) the source entity's relationship"),
});

type Entity = z.infer<typeof EntitySchema>;
type Relation = z.infer<typeof RelationSchema>;

const singularLabels: Record<Entity, string> = {
  contact: "contact",
  organization: "organization",
  deal: "deal",
  service: "service",
  task: "task",
};

const allowedRelations: Record<Entity, Relation[]> = {
  contact: ["organizations", "users", "deals", "tasks"],
  organization: ["contacts", "users", "deals", "tasks"],
  deal: ["organizations", "users", "contacts", "services", "tasks"],
  service: ["users", "deals", "tasks"],
  task: ["users", "contacts", "organizations", "deals", "services"],
};

const relationFieldName: Record<Relation, string> = {
  organizations: "organizationIds",
  contacts: "contactIds",
  deals: "dealIds",
  services: "services",
  tasks: "taskIds",
  users: "userIds",
};

// Task accepts `serviceIds` (no quantity) instead of `services` for its
// service relation. All other (entity, relation) pairs match `relationFieldName`.
function fieldNameFor(entity: Entity, relation: Relation): string {
  if (entity === "task" && relation === "services") return "serviceIds";
  return relationFieldName[relation];
}

type ConfigResult = { ok: true; data: unknown } | { ok: false; error: z.ZodError };

const configurationExecutors: Record<Entity, () => Promise<ConfigResult>> = {
  contact: async () => (await getGetContactsConfigurationInteractor().invoke()) as ConfigResult,
  organization: async () => (await getGetOrganizationsConfigurationInteractor().invoke()) as ConfigResult,
  deal: async () => (await getGetDealsConfigurationInteractor().invoke()) as ConfigResult,
  service: async () => (await getGetServicesConfigurationInteractor().invoke()) as ConfigResult,
  task: async () => (await getGetTasksConfigurationInteractor().invoke()) as ConfigResult,
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

async function updateEntityById(entity: Entity, payload: { id: string } & Record<string, unknown>): Promise<any> {
  return updateManyEntities(entity, [payload]);
}

async function loadEntityOrError(
  entity: Entity,
  id: string,
): Promise<{ ok: true; entity: any } | { ok: false; error: string }> {
  const result = await detailsExecutors[entity](id);
  if (!result.ok) return { ok: false, error: `Validation error: ${z.prettifyError(result.error)}` };
  const key = singularLabels[entity];
  const row = result.data?.[key];
  if (!row) return { ok: false, error: `Validation error: ${key[0].toUpperCase()}${key.slice(1)} ${id} not found` };
  return { ok: true, entity: row };
}

function currentRelationIds(entityRow: any, relation: Relation): string[] {
  const list = entityRow?.[relation];
  if (!Array.isArray(list)) return [];
  return list.map((item: any) => String(item.id)).filter((id) => id.length > 0);
}

function ensureAllowedRelation(entity: Entity, relation: Relation): string | null {
  if (!allowedRelations[entity].includes(relation)) {
    return (
      `Relation "${relation}" is not allowed on ${entity}. ` +
      `Allowed for ${entity}: ${allowedRelations[entity].join(", ")}.`
    );
  }
  return null;
}

export const getEntityConfigurationTool = {
  name: "get_entity_configuration",
  description:
    "Return the editable fields, custom columns, filter syntax, and sort syntax for one entity type. " +
    "Required: entity (contact, organization, deal, service, task). " +
    "Call this BEFORE any create / update / filter / sort / count call so you use valid field names and custom-column ids.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({ entity: EntitySchema }),
  execute: async ({ entity }: { entity: Entity }) => {
    const result = await configurationExecutors[entity]();
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      ...(result.data as Record<string, unknown>),
      filterSyntax: FILTER_SYNTAX,
      sortSyntax: SORT_SYNTAX,
    });
  },
};

export const filterEntityTool = {
  name: "filter_entity",
  description:
    "Search, filter, and sort records for a single entity type. " +
    "Required: entity. Optional: searchTerm, filters, sortDescriptor, page, pageSize (5/10/25/100, default 10). " +
    "Returns id and name per item plus total. Use count_entity when you only need the total, get_entities for full details.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: FilterEntitySchema,
  execute: async ({
    entity,
    searchTerm,
    filters,
    sortDescriptor,
    page,
    pageSize,
  }: z.infer<typeof FilterEntitySchema>) => {
    const result = await entityListExecutors[entity]({
      searchTerm,
      filters,
      sortDescriptor,
      pagination: { page, pageSize },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;

    return encodeToToon({
      items: result.data.items.map((item: any) => ({
        id: item.id,
        name: entityNameExtractors[entity](item),
      })),
      total: result.data.pagination?.total ?? result.data.items.length,
      page,
      ...(filters ? { filters } : {}),
    });
  },
};

export const countEntityTool = {
  name: "count_entity",
  description:
    "Count matching records for a single entity type. " +
    "Required: entity. Optional: filters, sortDescriptor. " +
    "Much cheaper than filter_entity when you only need the total.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: CountEntitySchema,
  execute: async ({ entity, filters, sortDescriptor }: z.infer<typeof CountEntitySchema>) => {
    const result = await entityListExecutors[entity]({
      filters,
      sortDescriptor,
      pagination: { page: 1, pageSize: 5 },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      total: result.data.pagination?.total ?? 0,
      filters,
    });
  },
};

export const getEntitiesTool = {
  name: "get_entities",
  description:
    "Fetch full details for one or more records by id. Mixed entity types are allowed in one call. " +
    "Required per item: entity, id. " +
    "Optional per item: include (masterData = fields only, default; withNotes = fields + markdown notes). " +
    "Use this before update_* or link_/unlink_* when you need the current state.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: DetailsEntitySchema,
  execute: async ({ items }: z.infer<typeof DetailsEntitySchema>) => {
    const results = await Promise.all(
      items.map(async ({ entity, id, include }) => {
        const result = await detailsExecutors[entity](id);
        if (!result.ok) return { error: `Validation error: ${z.prettifyError(result.error)}` };

        const key = singularLabels[entity];
        const row = result.data[key];
        if (!row) return { error: `${key[0].toUpperCase()}${key.slice(1)} not found` };

        const { notes, ...masterData } = row as Record<string, unknown> & { notes?: unknown };
        if (include === "withNotes") {
          const markdown = notes ? serializeJSONToMarkdown(notes as object) : null;
          return formatDatesInResponse({ [key]: masterData, notes: markdown });
        }

        return formatDatesInResponse({ [key]: masterData });
      }),
    );

    return encodeToToon(results);
  },
};

export const updateEntityNotesTool = {
  name: "update_entity_notes",
  description:
    "Replace markdown notes on up to 100 records of a single entity type. " +
    "Required: entity, items[{id, notes}]. " +
    "Pass empty string to clear notes. Idempotent.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: NotesEntitySchema,
  execute: async ({ entity, items }: z.infer<typeof NotesEntitySchema>) => {
    const normalized = items.map(({ id, notes }) => ({
      id,
      notes: notes.trim() === "" ? null : parseMarkdownToJSON(notes),
    }));
    const result = await updateManyEntities(entity, normalized);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated notes for ${normalized.length} ${singularLabels[entity]}(s)`;
  },
};

export const deleteEntitiesTool = {
  name: "delete_entities",
  description:
    "IRREVERSIBLE. Delete up to 100 records by id for a single entity type. " +
    "Required: entity, ids. " +
    "This cannot be undone. Consider exporting first. Idempotent on repeat (missing ids are reported as errors).",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  inputSchema: DeleteEntitySchema,
  execute: async ({ entity, ids }: z.infer<typeof DeleteEntitySchema>) => {
    const result = await deleteExecutors[entity](ids);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Deleted ${result.data.length} ${singularLabels[entity]}(s)`;
  },
};

export const updateEntityCustomFieldsTool = {
  name: "update_entity_custom_fields",
  description:
    "Set custom-column values on up to 100 records of a single entity type. " +
    "Required: entity, items[{id, customFieldValues[]}]. " +
    "Each customFieldValues entry is { columnId, value }. " +
    "Per-column merge: ONLY columns you include are changed. Columns you omit keep their current value. " +
    "To clear a column pass { columnId, value: null } (or empty string). " +
    "Date columns accept YYYY-MM-DD or full ISO 8601 datetime; dateTime columns require full ISO 8601 (e.g. 2026-05-01T14:30:00Z). " +
    "Call get_entity_configuration or list_custom_columns to discover column ids.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateCustomFieldEntitySchema,
  execute: async ({ entity, items }: z.infer<typeof UpdateCustomFieldEntitySchema>) => {
    const result = await updateManyEntities(entity, items);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated custom fields on ${result.data.length} ${singularLabels[entity]}(s)`;
  },
};

export const linkEntitiesTool = {
  name: "link_entities",
  description:
    "Add ids to a relationship on a single source entity, WITHOUT touching existing links. " +
    "Required: entity, sourceId, relation, ids. " +
    "Allowed (entity, relation) pairs: " +
    "contact -> organizations|users|deals|tasks; organization -> contacts|users|deals|tasks; " +
    "deal -> organizations|users|contacts|services|tasks; service -> users|deals|tasks; " +
    "task -> users|contacts|organizations|deals|services. " +
    "For deal -> services, new ids are added with quantity 1 (use update_deals to set exact quantities). " +
    "Idempotent: linking an already-linked id is a no-op.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: LinkEntitiesSchema,
  execute: async ({ entity, sourceId, relation, ids }: z.infer<typeof LinkEntitiesSchema>) => {
    const relationError = ensureAllowedRelation(entity, relation);
    if (relationError) return `Validation error: ${relationError}`;

    const loaded = await loadEntityOrError(entity, sourceId);
    if (!loaded.ok) return loaded.error;

    if (entity === "deal" && relation === "services") {
      const existing: Array<{ id: string; quantity?: number }> = Array.isArray(loaded.entity.services)
        ? loaded.entity.services
        : [];
      const existingMap = new Map(existing.map((s) => [s.id, s.quantity ?? 1]));
      for (const id of ids) if (!existingMap.has(id)) existingMap.set(id, 1);
      const services = [...existingMap.entries()].map(([serviceId, quantity]) => ({ serviceId, quantity }));
      const result = await updateEntityById("deal", { id: sourceId, services });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Linked ${ids.length} service(s) to ${entity} ${sourceId}`;
    }

    const current = currentRelationIds(loaded.entity, relation);
    const merged = Array.from(new Set([...current, ...ids]));
    const payload = { id: sourceId, [fieldNameFor(entity, relation)]: merged };
    const result = await updateEntityById(entity, payload);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Linked ${ids.length} ${relation} to ${entity} ${sourceId} (was ${current.length}, now ${merged.length})`;
  },
};

export const unlinkEntitiesTool = {
  name: "unlink_entities",
  description:
    "Remove ids from a relationship on a single source entity, WITHOUT touching other existing links. " +
    "Required: entity, sourceId, relation, ids. " +
    "Allowed (entity, relation) pairs: " +
    "contact -> organizations|users|deals|tasks; organization -> contacts|users|deals|tasks; " +
    "deal -> organizations|users|contacts|services|tasks; service -> users|deals|tasks; " +
    "task -> users|contacts|organizations|deals|services. " +
    "Idempotent: unlinking an id that was not linked is a no-op. " +
    "This does NOT delete the related entity; it only removes the link.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: LinkEntitiesSchema,
  execute: async ({ entity, sourceId, relation, ids }: z.infer<typeof LinkEntitiesSchema>) => {
    const relationError = ensureAllowedRelation(entity, relation);
    if (relationError) return `Validation error: ${relationError}`;

    const loaded = await loadEntityOrError(entity, sourceId);
    if (!loaded.ok) return loaded.error;

    const removeSet = new Set(ids);

    if (entity === "deal" && relation === "services") {
      const existing: Array<{ id: string; quantity?: number }> = Array.isArray(loaded.entity.services)
        ? loaded.entity.services
        : [];
      const services = existing
        .filter((s) => !removeSet.has(s.id))
        .map((s) => ({ serviceId: s.id, quantity: s.quantity ?? 1 }));
      const result = await updateEntityById("deal", { id: sourceId, services });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Unlinked ${ids.length} service(s) from ${entity} ${sourceId}`;
    }

    const current = currentRelationIds(loaded.entity, relation);
    const kept = current.filter((id) => !removeSet.has(id));
    const payload = { id: sourceId, [fieldNameFor(entity, relation)]: kept };
    const result = await updateEntityById(entity, payload);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Unlinked ${ids.length} ${relation} from ${entity} ${sourceId} (was ${current.length}, now ${kept.length})`;
  },
};

export const appendEntityNotesTool = {
  name: "append_entity_notes",
  description:
    "Append markdown to existing notes on up to 100 records of a single entity type, WITHOUT overwriting. " +
    "Required: entity, items[{id, notes}]. " +
    "Existing notes are preserved; new content is added after a blank line. " +
    "Use update_entity_notes to replace instead of append.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: AppendNotesSchema,
  execute: async ({ entity, items }: z.infer<typeof AppendNotesSchema>) => {
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
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Appended notes on ${merged.length} ${singularLabels[entity]}(s)`;
  },
};

export const searchAllEntitiesTool = {
  name: "search_all_entities",
  description:
    "Free-text search across every entity type in one call. " +
    "Required: searchTerm. Optional: entities (restrict to specific types), limitPerEntity (default 5, max 100). " +
    "Returns up to `limitPerEntity` matches per entity type with { entity, id, name }. " +
    "Use this when you don't know which entity holds what you're looking for. For filtered/paginated results, use filter_entity.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: SearchAllSchema,
  execute: async ({ searchTerm, entities, limitPerEntity }: z.infer<typeof SearchAllSchema>) => {
    const targets: Entity[] = entities ?? ["contact", "organization", "deal", "service", "task"];
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

    return encodeToToon({ searchTerm, results });
  },
};
