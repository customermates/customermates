import { z } from "zod";

import { encodeToToon, FILTER_SYNTAX, formatDatesInResponse } from "./utils";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { CustomFieldValueSchema } from "@/core/base/base-entity.schema";
import { serializeJSONToMarkdown } from "@/components/x-editor/x-editor.utils";
import {
  getGetContactsApiInteractor,
  getGetContactByIdInteractor,
  getDeleteManyContactsInteractor,
  getGetContactsConfigurationInteractor,
  getUpdateManyContactsInteractor,
  getGetOrganizationsApiInteractor,
  getGetOrganizationByIdInteractor,
  getDeleteManyOrganizationsInteractor,
  getGetOrganizationsConfigurationInteractor,
  getUpdateManyOrganizationsInteractor,
  getGetDealsApiInteractor,
  getGetDealByIdInteractor,
  getDeleteManyDealsInteractor,
  getGetDealsConfigurationInteractor,
  getUpdateManyDealsInteractor,
  getGetServicesApiInteractor,
  getGetServiceByIdInteractor,
  getDeleteManyServicesInteractor,
  getGetServicesConfigurationInteractor,
  getUpdateManyServicesInteractor,
  getGetTasksApiInteractor,
  getGetTaskByIdInteractor,
  getDeleteManyTasksInteractor,
  getGetTasksConfigurationInteractor,
  getUpdateManyTasksInteractor,
} from "@/core/di";

const EntitySchema = z.enum(["contact", "organization", "deal", "service", "task"]);

const FilterEntitySchema = z.object({
  entity: EntitySchema,
  searchTerm: z.string().optional(),
  filters: z.array(FilterSchema).optional(),
  sortDescriptor: SortDescriptorSchema.optional(),
  page: z.number().int().min(1).default(1),
});

const CountEntitySchema = z.object({
  entity: EntitySchema,
  filters: z.array(FilterSchema).optional(),
  sortDescriptor: SortDescriptorSchema.optional(),
});

const DetailsEntitySchema = z.object({
  items: z
    .array(
      z.object({
        entity: EntitySchema,
        id: z.uuid(),
        include: z.enum(["masterData", "withNotes"]).default("masterData"),
      }),
    )
    .min(1)
    .max(10),
});

const NotesEntitySchema = z.object({
  entity: EntitySchema,
  items: z
    .array(
      z.object({
        id: z.uuid(),
        notes: z.string(),
      }),
    )
    .min(1)
    .max(10),
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

type Entity = z.infer<typeof EntitySchema>;
type FilterInput = z.infer<typeof FilterSchema>;
type SortInput = z.infer<typeof SortDescriptorSchema>;

type ListQueryParams = {
  searchTerm?: string;
  filters?: FilterInput[];
  sortDescriptor?: SortInput;
  pagination: { page: number; pageSize: 5 | 10 | 25 | 100 };
};

const singularLabels: Record<Entity, string> = {
  contact: "contact",
  organization: "organization",
  deal: "deal",
  service: "service",
  task: "task",
};

const configurationExecutors: Record<Entity, () => Promise<unknown>> = {
  contact: async () => {
    const result = await getGetContactsConfigurationInteractor().invoke();
    return result.data;
  },
  organization: async () => {
    const result = await getGetOrganizationsConfigurationInteractor().invoke();
    return result.data;
  },
  deal: async () => {
    const result = await getGetDealsConfigurationInteractor().invoke();
    return result.data;
  },
  service: async () => {
    const result = await getGetServicesConfigurationInteractor().invoke();
    return result.data;
  },
  task: async () => {
    const result = await getGetTasksConfigurationInteractor().invoke();
    return result.data;
  },
};

const listExecutors: Record<Entity, (params: ListQueryParams) => Promise<any>> = {
  contact: async (params) => getGetContactsApiInteractor().invoke(params),
  organization: async (params) => getGetOrganizationsApiInteractor().invoke(params),
  deal: async (params) => getGetDealsApiInteractor().invoke(params),
  service: async (params) => getGetServicesApiInteractor().invoke(params),
  task: async (params) => getGetTasksApiInteractor().invoke(params),
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

const nameExtractors: Record<Entity, (item: any) => string> = {
  contact: (item) => `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim(),
  organization: (item) => String(item.name ?? ""),
  deal: (item) => String(item.name ?? ""),
  service: (item) => String(item.name ?? ""),
  task: (item) => String(item.name ?? ""),
};

export const getEntityConfigurationTool = {
  name: "get_entity_configuration",
  description:
    "Get available fields, custom columns, and filters for one entity type. Use before create/update/filter operations.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: z.object({ entity: EntitySchema }),
  execute: async ({ entity }: { entity: z.infer<typeof EntitySchema> }) => {
    const result = await configurationExecutors[entity]();
    return encodeToToon({ ...(result as Record<string, unknown>), filterSyntax: FILTER_SYNTAX });
  },
};

export const filterEntityTool = {
  name: "filter_entity",
  description: "Search, filter, and sort records for a selected entity type.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: FilterEntitySchema,
  execute: async ({ entity, searchTerm, filters, sortDescriptor, page }: z.infer<typeof FilterEntitySchema>) => {
    const result = await listExecutors[entity]({
      searchTerm,
      filters,
      sortDescriptor,
      pagination: { page, pageSize: 10 },
    });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;

    return encodeToToon({
      items: result.data.items.map((item: any) => ({
        id: item.id,
        name: nameExtractors[entity](item),
      })),
      total: result.data.pagination?.total ?? result.data.items.length,
      page,
      ...(filters ? { filters } : {}),
    });
  },
};

export const countEntityTool = {
  name: "count_entity",
  description: "Count records for a selected entity type using optional filters.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: CountEntitySchema,
  execute: async ({ entity, filters, sortDescriptor }: z.infer<typeof CountEntitySchema>) => {
    const result = await listExecutors[entity]({
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

export const batchGetEntityDetailsTool = {
  name: "batch_get_entity_details",
  description: "Get details by IDs for selected entity types. Supports mixed entity types in a single call.",
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

export const batchSetEntityNotesTool = {
  name: "batch_set_entity_notes",
  description: "Set markdown notes for a selected entity type. Pass empty string to clear notes.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: NotesEntitySchema,
  execute: async ({ entity, items }: z.infer<typeof NotesEntitySchema>) => {
    const normalized = items.map(({ id, notes }) => ({
      id,
      notes: notes.trim() === "" ? null : notes,
    }));

    if (entity === "contact") {
      const result = await getUpdateManyContactsInteractor().invoke({ contacts: normalized });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated notes for ${normalized.length} ${singularLabels[entity]}(s)`;
    }
    if (entity === "organization") {
      const result = await getUpdateManyOrganizationsInteractor().invoke({ organizations: normalized });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated notes for ${normalized.length} ${singularLabels[entity]}(s)`;
    }
    if (entity === "deal") {
      const result = await getUpdateManyDealsInteractor().invoke({ deals: normalized });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated notes for ${normalized.length} ${singularLabels[entity]}(s)`;
    }
    if (entity === "service") {
      const result = await getUpdateManyServicesInteractor().invoke({ services: normalized });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated notes for ${normalized.length} ${singularLabels[entity]}(s)`;
    }

    const result = await getUpdateManyTasksInteractor().invoke({ tasks: normalized });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated notes for ${normalized.length} ${singularLabels.task}(s)`;
  },
};

export const batchDeleteEntityTool = {
  name: "batch_delete_entity",
  description: "Delete records by IDs for a selected entity type. Irreversible.",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  inputSchema: DeleteEntitySchema,
  execute: async ({ entity, ids }: z.infer<typeof DeleteEntitySchema>) => {
    const result = await deleteExecutors[entity](ids);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Deleted ${result.data.length} ${singularLabels[entity]}(s)`;
  },
};

export const batchUpdateEntityCustomFieldTool = {
  name: "batch_update_entity_custom_field",
  description: "Update custom fields for selected records of one entity type.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateCustomFieldEntitySchema,
  execute: async ({ entity, items }: z.infer<typeof UpdateCustomFieldEntitySchema>) => {
    if (entity === "contact") {
      const result = await getUpdateManyContactsInteractor().invoke({ contacts: items });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated ${result.data.length} ${singularLabels[entity]}(s)`;
    }

    if (entity === "organization") {
      const result = await getUpdateManyOrganizationsInteractor().invoke({ organizations: items });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated ${result.data.length} ${singularLabels[entity]}(s)`;
    }

    if (entity === "deal") {
      const result = await getUpdateManyDealsInteractor().invoke({ deals: items });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated ${result.data.length} ${singularLabels[entity]}(s)`;
    }

    if (entity === "service") {
      const result = await getUpdateManyServicesInteractor().invoke({ services: items });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated ${result.data.length} ${singularLabels[entity]}(s)`;
    }

    const result = await getUpdateManyTasksInteractor().invoke({ tasks: items });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} ${singularLabels.task}(s)`;
  },
};
