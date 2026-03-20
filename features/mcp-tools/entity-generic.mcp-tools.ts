import { z } from "zod";

import { encodeToToon, FILTER_SYNTAX, formatDatesInResponse } from "./utils";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { CustomFieldValueSchema } from "@/core/base/base-entity.schema";
import { di } from "@/core/dependency-injection/container";
import { serializeJSONToMarkdown } from "@/components/x-editor/x-editor.utils";
import { GetContactsApiInteractor } from "@/features/contacts/get/get-contacts-api.interactor";
import { GetContactByIdInteractor } from "@/features/contacts/get/get-contact-by-id.interactor";
import { DeleteManyContactsInteractor } from "@/features/contacts/delete/delete-many-contacts.interactor";
import { GetContactsConfigurationInteractor } from "@/features/contacts/get/get-contacts-configuration.interactor";
import { UpdateManyContactsInteractor } from "@/features/contacts/upsert/update-many-contacts.interactor";
import { GetOrganizationsApiInteractor } from "@/features/organizations/get/get-organizations-api.interactor";
import { GetOrganizationByIdInteractor } from "@/features/organizations/get/get-organization-by-id.interactor";
import { DeleteManyOrganizationsInteractor } from "@/features/organizations/delete/delete-many-organizations.interactor";
import { GetOrganizationsConfigurationInteractor } from "@/features/organizations/get/get-organizations-configuration.interactor";
import { UpdateManyOrganizationsInteractor } from "@/features/organizations/upsert/update-many-organizations.interactor";
import { GetDealsApiInteractor } from "@/features/deals/get/get-deals-api.interactor";
import { GetDealByIdInteractor } from "@/features/deals/get/get-deal-by-id.interactor";
import { DeleteManyDealsInteractor } from "@/features/deals/delete/delete-many-deals.interactor";
import { GetDealsConfigurationInteractor } from "@/features/deals/get/get-deals-configuration.interactor";
import { UpdateManyDealsInteractor } from "@/features/deals/upsert/update-many-deals.interactor";
import { GetServicesApiInteractor } from "@/features/services/get/get-services-api.interactor";
import { GetServiceByIdInteractor } from "@/features/services/get/get-service-by-id.interactor";
import { DeleteManyServicesInteractor } from "@/features/services/delete/delete-many-services.interactor";
import { GetServicesConfigurationInteractor } from "@/features/services/get/get-services-configuration.interactor";
import { UpdateManyServicesInteractor } from "@/features/services/upsert/update-many-services.interactor";
import { GetTasksApiInteractor } from "@/features/tasks/get/get-tasks-api.interactor";
import { GetTaskByIdInteractor } from "@/features/tasks/get/get-task-by-id.interactor";
import { DeleteManyTasksInteractor } from "@/features/tasks/delete/delete-many-tasks.interactor";
import { GetTasksConfigurationInteractor } from "@/features/tasks/get/get-tasks-configuration.interactor";
import { UpdateManyTasksInteractor } from "@/features/tasks/upsert/update-many-tasks.interactor";

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
  entity: EntitySchema,
  id: z.uuid(),
  include: z.enum(["masterData", "withNotes"]).default("masterData"),
});

const NotesEntitySchema = z.object({
  entity: EntitySchema,
  id: z.uuid(),
  notes: z.string(),
});

const DeleteEntitySchema = z.object({
  entity: EntitySchema,
  ids: z.array(z.uuid()).min(1).max(10),
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
    .max(10),
});

type Entity = z.infer<typeof EntitySchema>;
type FilterInput = z.infer<typeof FilterSchema>;
type SortInput = z.infer<typeof SortDescriptorSchema>;

type ListQueryParams = {
  searchTerm?: string;
  filters?: FilterInput[];
  sortDescriptor?: SortInput;
  pagination: { page: number; pageSize: 5 | 10 | 25 | 100 | 1000 };
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
    return di.get(GetContactsConfigurationInteractor).invoke();
  },
  organization: async () => {
    return di.get(GetOrganizationsConfigurationInteractor).invoke();
  },
  deal: async () => {
    return di.get(GetDealsConfigurationInteractor).invoke();
  },
  service: async () => {
    return di.get(GetServicesConfigurationInteractor).invoke();
  },
  task: async () => {
    return di.get(GetTasksConfigurationInteractor).invoke();
  },
};

const listExecutors: Record<Entity, (params: ListQueryParams) => Promise<any>> = {
  contact: async (params) => di.get(GetContactsApiInteractor).invoke(params),
  organization: async (params) => di.get(GetOrganizationsApiInteractor).invoke(params),
  deal: async (params) => di.get(GetDealsApiInteractor).invoke(params),
  service: async (params) => di.get(GetServicesApiInteractor).invoke(params),
  task: async (params) => di.get(GetTasksApiInteractor).invoke(params),
};

const detailsExecutors: Record<Entity, (id: string) => Promise<any>> = {
  contact: async (id) => di.get(GetContactByIdInteractor).invoke({ id }),
  organization: async (id) => di.get(GetOrganizationByIdInteractor).invoke({ id }),
  deal: async (id) => di.get(GetDealByIdInteractor).invoke({ id }),
  service: async (id) => di.get(GetServiceByIdInteractor).invoke({ id }),
  task: async (id) => di.get(GetTaskByIdInteractor).invoke({ id }),
};

const deleteExecutors: Record<Entity, (ids: string[]) => Promise<any>> = {
  contact: async (ids) => di.get(DeleteManyContactsInteractor).invoke({ ids }),
  organization: async (ids) => di.get(DeleteManyOrganizationsInteractor).invoke({ ids }),
  deal: async (ids) => di.get(DeleteManyDealsInteractor).invoke({ ids }),
  service: async (ids) => di.get(DeleteManyServicesInteractor).invoke({ ids }),
  task: async (ids) => di.get(DeleteManyTasksInteractor).invoke({ ids }),
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

export const getEntityDetailsTool = {
  name: "get_entity_details",
  description: "Get details by ID for a selected entity type.",
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: DetailsEntitySchema,
  execute: async ({ entity, id, include }: z.infer<typeof DetailsEntitySchema>) => {
    const result = await detailsExecutors[entity](id);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;

    const key = singularLabels[entity];
    const row = result.data[key];
    if (!row) return `${key[0].toUpperCase()}${key.slice(1)} not found`;

    const { notes, ...masterData } = row as Record<string, unknown> & { notes?: unknown };
    if (include === "withNotes") {
      const markdown = notes ? serializeJSONToMarkdown(notes as object) : null;
      return encodeToToon(formatDatesInResponse({ [key]: masterData, notes: markdown }));
    }

    return encodeToToon(formatDatesInResponse({ [key]: masterData }));
  },
};

export const setEntityNotesTool = {
  name: "set_entity_notes",
  description: "Set markdown notes by ID for a selected entity type. Pass empty string to clear notes.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: NotesEntitySchema,
  execute: async ({ entity, id, notes }: z.infer<typeof NotesEntitySchema>) => {
    const normalizedNotes = notes.trim() === "" ? null : notes;

    if (entity === "contact") {
      const result = await di.get(UpdateManyContactsInteractor).invoke({ contacts: [{ id, notes: normalizedNotes }] });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return "Notes updated successfully.";
    }
    if (entity === "organization") {
      const result = await di
        .get(UpdateManyOrganizationsInteractor)
        .invoke({ organizations: [{ id, notes: normalizedNotes }] });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return "Notes updated successfully.";
    }
    if (entity === "deal") {
      const result = await di.get(UpdateManyDealsInteractor).invoke({ deals: [{ id, notes: normalizedNotes }] });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return "Notes updated successfully.";
    }
    if (entity === "service") {
      const result = await di.get(UpdateManyServicesInteractor).invoke({ services: [{ id, notes: normalizedNotes }] });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return "Notes updated successfully.";
    }

    const result = await di.get(UpdateManyTasksInteractor).invoke({ tasks: [{ id, notes: normalizedNotes }] });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return "Notes updated successfully.";
  },
};

export const deleteEntityTool = {
  name: "delete_entity",
  description: "Delete records by IDs for a selected entity type. Irreversible.",
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  inputSchema: DeleteEntitySchema,
  execute: async ({ entity, ids }: z.infer<typeof DeleteEntitySchema>) => {
    const result = await deleteExecutors[entity](ids);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Deleted ${result.data.length} ${singularLabels[entity]}(s)`;
  },
};

export const updateEntityCustomFieldTool = {
  name: "batch_update_entity_custom_field",
  description: "Batch update custom fields for selected records of one entity type.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateCustomFieldEntitySchema,
  execute: async ({ entity, items }: z.infer<typeof UpdateCustomFieldEntitySchema>) => {
    if (entity === "contact") {
      const result = await di.get(UpdateManyContactsInteractor).invoke({ contacts: items });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated ${result.data.length} ${singularLabels[entity]}(s)`;
    }

    if (entity === "organization") {
      const result = await di.get(UpdateManyOrganizationsInteractor).invoke({ organizations: items });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated ${result.data.length} ${singularLabels[entity]}(s)`;
    }

    if (entity === "deal") {
      const result = await di.get(UpdateManyDealsInteractor).invoke({ deals: items });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated ${result.data.length} ${singularLabels[entity]}(s)`;
    }

    if (entity === "service") {
      const result = await di.get(UpdateManyServicesInteractor).invoke({ services: items });
      if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
      return `Updated ${result.data.length} ${singularLabels[entity]}(s)`;
    }

    const result = await di.get(UpdateManyTasksInteractor).invoke({ tasks: items });
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} ${singularLabels.task}(s)`;
  },
};
