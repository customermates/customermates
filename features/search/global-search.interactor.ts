import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { entityListExecutors, entityNameExtractors } from "./entity-list-executors";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  searchTerm: z.string().min(1),
});

export type GlobalSearchData = z.infer<typeof Schema>;

export type GlobalSearchResultItem =
  | { type: "contact"; id: string; name: string }
  | { type: "organization"; id: string; name: string }
  | { type: "deal"; id: string; name: string }
  | { type: "service"; id: string; name: string };

export type GlobalSearchResult = {
  results: GlobalSearchResultItem[];
};

const GlobalSearchResultSchema = z.object({
  results: z.array(
    z.object({
      type: z.enum(["contact", "organization", "deal", "service"]),
      id: z.string(),
      name: z.string(),
    }),
  ),
});

const UI_SEARCHABLE_ENTITIES = ["contact", "organization", "deal", "service"] as const;
const UI_RESULTS_PER_ENTITY = 50;

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
  ],
  condition: "OR",
})
export class GlobalSearchInteractor extends AuthenticatedInteractor<GlobalSearchData, GlobalSearchResult> {
  @Enforce(Schema)
  @ValidateOutput(GlobalSearchResultSchema)
  async invoke(data: GlobalSearchData): Promise<{ ok: true; data: GlobalSearchResult }> {
    const { searchTerm } = data;

    const perEntity = await Promise.all(
      UI_SEARCHABLE_ENTITIES.map(async (entity): Promise<GlobalSearchResultItem[]> => {
        const result = await entityListExecutors[entity]({
          searchTerm,
          pagination: { page: 1, pageSize: 100 },
        });
        if (!result.ok) return [];
        const items: any[] = result.data?.items ?? [];
        return items.slice(0, UI_RESULTS_PER_ENTITY).map((item) => ({
          type: entity,
          id: item.id,
          name: entityNameExtractors[entity](item),
        })) as GlobalSearchResultItem[];
      }),
    );

    return { ok: true as const, data: { results: perEntity.flat() } };
  }
}
