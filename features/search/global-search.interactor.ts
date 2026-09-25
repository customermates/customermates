import { z } from "zod";
import { Resource, Action, EntityType, TaskType } from "@/generated/prisma";

import { entityListExecutors, entityNameExtractors } from "./entity-list-executors";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  searchTerm: z.string().min(1).max(200),
  limitPerEntity: z.number().int().min(1).max(50).optional(),
});

export type GlobalSearchData = z.infer<typeof Schema>;

export type GlobalSearchResultItem = {
  type: EntityType;
  id: string;
  name: string;
  pictureUrl: string | null;
  taskType?: TaskType;
};

export type GlobalSearchResult = {
  results: GlobalSearchResultItem[];
};

const OutputSchema = z.object({
  results: z.array(
    z.object({
      type: z.enum(EntityType),
      id: z.string(),
      name: z.string(),
      pictureUrl: z.string().nullable(),
      taskType: z.enum(TaskType).optional(),
    }),
  ),
});

const UI_SEARCHABLE_ENTITIES = Object.values(EntityType);
const SEARCH_RESOURCE: Record<EntityType, Resource> = {
  contact: Resource.contacts,
  organization: Resource.organizations,
  deal: Resource.deals,
  service: Resource.services,
  task: Resource.tasks,
};
const DEFAULT_RESULTS_PER_ENTITY = 50;

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readOwn },
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readOwn },
    { resource: Resource.deals, action: Action.readAll },
    { resource: Resource.deals, action: Action.readOwn },
    { resource: Resource.services, action: Action.readAll },
    { resource: Resource.services, action: Action.readOwn },
    { resource: Resource.tasks, action: Action.readAll },
    { resource: Resource.tasks, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GlobalSearchInteractor extends AuthenticatedInteractor<GlobalSearchData, GlobalSearchResult> {
  @Enforce(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: GlobalSearchData): Promise<{ ok: true; data: GlobalSearchResult }> {
    const limitPerEntity = data.limitPerEntity ?? DEFAULT_RESULTS_PER_ENTITY;
    const pageSize = limitPerEntity <= 5 ? 5 : limitPerEntity <= 10 ? 10 : limitPerEntity <= 25 ? 25 : 100;
    const searchableEntities = this.user.role?.isSystemRole
      ? UI_SEARCHABLE_ENTITIES
      : UI_SEARCHABLE_ENTITIES.filter((entity) =>
          this.user.role?.permissions.some(
            (permission) =>
              permission.resource === SEARCH_RESOURCE[entity] &&
              (permission.action === Action.readAll || permission.action === Action.readOwn),
          ),
        );
    const perEntity = await Promise.all(
      searchableEntities.map(async (entity): Promise<GlobalSearchResultItem[]> => {
        const result = await entityListExecutors[entity]({
          searchTerm: data.searchTerm,
          pagination: { page: 1, pageSize },
        });
        if (!result.ok) return [];
        const items: any[] = result.data?.items ?? [];
        return items.slice(0, limitPerEntity).map((item) => ({
          type: entity,
          id: item.id,
          name: entityNameExtractors[entity](item),
          pictureUrl: entity === "contact" && typeof item.avatarUrl === "string" ? item.avatarUrl : null,
          ...(entity === "task" && Object.values(TaskType).includes(item.type) ? { taskType: item.type } : {}),
        })) as GlobalSearchResultItem[];
      }),
    );

    return { ok: true as const, data: { results: perEntity.flat() } };
  }
}
